const test = require("node:test");
const assert = require("node:assert/strict");
const prisma = require("../../models/prismaClient");
const { syncSupportMessage } = require("./supportSyncWorker");

test("two replicas racing to deliver one support message get one atomic claim", async (t) => {
  const oldClaim = prisma.message.updateMany;
  const oldUpdate = prisma.message.update;
  const oldFetch = global.fetch;
  let leased = false;
  let deliveries = 0;
  prisma.message.updateMany = async ({ where, data }) => {
    assert.equal(where.id, "message");
    assert.equal(where.syncStatus, "PENDING");
    assert.ok(data.nextRetryAt > new Date());
    if (leased) return { count: 0 };
    leased = true;
    return { count: 1 };
  };
  prisma.message.update = async () => ({});
  global.fetch = async () => {
    deliveries++;
    return { ok: true };
  };
  t.after(() => {
    prisma.message.updateMany = oldClaim;
    prisma.message.update = oldUpdate;
    global.fetch = oldFetch;
  });
  const message = { id: "message", syncStatus: "PENDING", nextRetryAt: null };
  const conversation = { contextType: "SUPPORT", contextId: "ticket" };
  await Promise.all([
    syncSupportMessage(conversation, message),
    syncSupportMessage(conversation, message),
  ]);
  assert.equal(deliveries, 1);
});
