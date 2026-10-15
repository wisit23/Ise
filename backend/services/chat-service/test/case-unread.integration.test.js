const test = require("node:test");
const assert = require("node:assert/strict");
const { PrismaClient } = require("../src/generated/prisma-client");
const { caseUnread } = require("../src/features/internal/caseUnread");

test("Mongo unread merges Buyer/Seller rooms, respects per-agent read state and excludes non-customer content", async (t) => {
  const raw = process.env.DATABASE_URL_CHAT;
  if (
    !raw ||
    !["127.0.0.1", "localhost"].includes(new URL(raw).hostname) ||
    !/^\/reloop_ci_[a-z0-9_]+$/.test(new URL(raw).pathname)
  ) {
    if (process.env.REQUIRE_INTEGRATION === "1")
      throw new Error("Disposable DATABASE_URL_CHAT required");
    t.skip("Set disposable DATABASE_URL_CHAT");
    return;
  }
  const db = new PrismaClient({ datasources: { db: { url: raw } } });
  const ids = [];
  t.after(async () => {
    await db.message.deleteMany({ where: { conversationId: { in: ids } } });
    await db.conversation.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });
  const created = new Date("2026-10-15T00:00:00Z"),
    cutoff = new Date("2026-10-15T01:00:00Z"),
    newer = new Date("2026-10-15T02:00:00Z");
  const suffix = Date.now();
  const room = async (type, contextId) => {
    const row = await db.conversation.create({
      data: {
        contextType: type,
        contextId,
        contextKey: `${type}:${contextId}:${suffix}`,
        createdBy: "buyer",
        createdAt: created,
        participants: [
          { userId: "cs", role: "AGENT", joinedAt: cutoff, lastReadAt: cutoff },
        ],
      },
    });
    ids.push(row.id);
    return row.id;
  };
  const buyer = await room("DISPUTE_BUYER", "d1"),
    seller = await room("DISPUTE_SELLER", "d1");
  const support = await room("SUPPORT", "t1");
  const message = (conversationId, fields = {}) =>
    db.message.create({
      data: {
        conversationId,
        senderId: "customer",
        senderRole: "BUYER",
        body: "Unread",
        createdAt: newer,
        ...fields,
      },
    });
  await message(buyer);
  await message(buyer);
  await message(seller, { senderRole: "SELLER" });
  await message(buyer, { createdAt: cutoff });
  await message(buyer, { senderRole: "AGENT" });
  await message(buyer, { senderRole: "SYSTEM", type: "SYSTEM" });
  await message(buyer, { visibility: "INTERNAL" });
  await message(buyer, { deletedAt: newer });
  await message(support, { senderRole: "REQUESTER" });
  const read = async (userId, contextTypes, requestedIds) => {
    let result;
    await caseUnread(
      { body: { userId, contextTypes, ids: requestedIds } },
      {
        json: (data) => {
          result = data;
        },
      },
      (err) => {
        throw err;
      },
      db,
    );
    return result.items;
  };
  assert.deepEqual(
    await read("cs", ["DISPUTE_BUYER", "DISPUTE_SELLER"], ["d1"]),
    [{ id: "d1", count: 3 }],
  );
  assert.deepEqual(
    await read("new-agent", ["DISPUTE_BUYER", "DISPUTE_SELLER"], ["d1"]),
    [{ id: "d1", count: 4 }],
    "unassigned queues count historical customer messages before joining",
  );
  await db.conversation.update({
    where: { id: buyer },
    data: {
      participants: {
        set: [
          { userId: "cs", role: "AGENT", joinedAt: cutoff, lastReadAt: newer },
        ],
      },
    },
  });
  assert.deepEqual(
    await read("cs", ["DISPUTE_BUYER", "DISPUTE_SELLER"], ["d1"]),
    [{ id: "d1", count: 1 }],
  );
  assert.deepEqual(await read("cs", ["SUPPORT"], ["t1"]), [
    { id: "t1", count: 1 },
  ]);
  assert.deepEqual(await read("cs", ["SUPPORT"], ["private"]), []);
});
