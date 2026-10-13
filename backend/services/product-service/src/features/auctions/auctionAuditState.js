const ROUND_FIELDS = ["title", "categories", "cancellationReason", "cancelledAt", "cancelledBy"];
const ITEM_FIELDS = ["cancellationReason", "cancelledAt", "cancelledBy"];

function splitFields(data, entityType) {
  const columns = { ...data };
  const erFields = {};
  for (const key of entityType === "AUCTION_ROUND" ? ROUND_FIELDS : ITEM_FIELDS) {
    if (key in columns) { erFields[key] = columns[key]; delete columns[key]; }
  }
  return { columns, erFields };
}

async function readFields(client, entityType, entityId) {
  const log = await client.marketingAuditLog.findFirst({
    where: { entityType, entityId, action: { in: ["ER_STATE_IMPORT", "ER_STATE_SNAPSHOT"] } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  const fields = { ...(log?.metadata?.erFields || {}) };
  if (fields.cancelledAt) fields.cancelledAt = new Date(fields.cancelledAt);
  return fields;
}

async function saveFields(client, entityType, entityId, patch) {
  if (!Object.keys(patch).length) return;
  const previousLog = await client.marketingAuditLog.findFirst({
    where: { entityType, entityId, action: { in: ["ER_STATE_IMPORT", "ER_STATE_SNAPSHOT"] } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  const previous = previousLog?.metadata?.erFields || {};
  // Entity mutation holds its row/advisory lock; monotonic milliseconds also
  // avoid equal transaction timestamps making random UUIDs choose stale state.
  const createdAt = new Date(Math.max(Date.now(), new Date(previousLog?.createdAt || 0).getTime() + 1));
  await client.marketingAuditLog.create({ data: {
    createdAt,
    actorId: "PRODUCT_SERVICE", actorRole: "SYSTEM", action: "ER_STATE_SNAPSHOT",
    entityType, entityId,
    metadata: JSON.parse(JSON.stringify({
      provenance: "current state projection; command actor is recorded by the command audit",
      erFields: { ...previous, ...patch },
    })),
  } });
}

async function hydrateRound(client, round) {
  if (!round) return round;
  const hydrated = { title: "", categories: [], cancellationReason: null, cancelledAt: null, cancelledBy: null,
    ...round, ...(await readFields(client, "AUCTION_ROUND", round.id)) };
  if (round.auctions) hydrated.auctions = await Promise.all(round.auctions.map((a) => hydrateItem(client, a)));
  return hydrated;
}

async function hydrateItem(client, item) {
  if (!item) return item;
  const hydrated = { cancellationReason: null, cancelledAt: null, cancelledBy: null,
    ...item, ...(await readFields(client, "AUCTION_ITEM", item.id)) };
  if (item.round) hydrated.round = await hydrateRound(client, item.round);
  return hydrated;
}

async function writeRound(client, operation, args) {
  const { columns, erFields } = splitFields(args.data, "AUCTION_ROUND");
  const row = await client.auctionRound[operation]({ ...args, data: {
    ...columns, ...(operation === "update" ? { updatedAt: new Date() } : {}),
  } });
  await saveFields(client, "AUCTION_ROUND", row.id, erFields);
  return hydrateRound(client, row);
}

async function writeItem(client, operation, args) {
  const { columns, erFields } = splitFields(args.data, "AUCTION_ITEM");
  const row = await client.auctionItem[operation]({ ...args, data: columns });
  await saveFields(client, "AUCTION_ITEM", row.id, erFields);
  return hydrateItem(client, row);
}

module.exports = { splitFields, saveFields, hydrateRound, hydrateItem, writeRound, writeItem };
