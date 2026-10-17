// Auction state now belongs to the auction rows. Audit records are history only.
function splitFields(data) {
  return { columns: { ...data }, erFields: {} };
}
async function saveFields(client, entityType, entityId, patch) {
  if (!Object.keys(patch).length) return;
  const delegate =
    entityType === "AUCTION_ROUND" ? client.auctionRound : client.auctionItem;
  await delegate.update({ where: { id: entityId }, data: patch });
}
async function hydrateRound(client, round) {
  return round;
}
async function hydrateItem(client, item) {
  return item;
}
async function writeRound(client, operation, args) {
  return client.auctionRound[operation]({
    ...args,
    data: {
      ...args.data,
      ...(operation === "update" ? { updatedAt: new Date() } : {}),
    },
  });
}
async function writeItem(client, operation, args) {
  return client.auctionItem[operation](args);
}
module.exports = {
  splitFields,
  saveFields,
  hydrateRound,
  hydrateItem,
  writeRound,
  writeItem,
};
