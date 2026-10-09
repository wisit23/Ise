const test = require("node:test");
const assert = require("node:assert/strict");
const { processEvent, processPendingEvents } = require("./productSyncService");
function fixture() {
  const request = {
    id: "r1",
    orderId: "o1",
    buyerId: "b1",
    sellerId: "s1",
    actorId: "b1",
    action: "PRODUCT_SYNC_REQUESTED",
    detail: JSON.stringify({
      action: "RELEASE_RESERVATION",
      productId: "p1",
      reservationId: "basket1",
    }),
  };
  const logs = [request];
  const db = {
    orderLog: {
      findUnique: async () => request,
      findFirst: async ({ where }) =>
        logs.find(
          (l) => l.action === where.action && l.detail === where.detail,
        ),
      findMany: async ({ where }) =>
        logs.filter((l) => l.action === where.action),
      create: async ({ data }) => {
        logs.push(data);
        return data;
      },
    },
  };
  return { db, logs, request };
}
test("failed delivery leaves durable request available for retry", async () => {
  const { db, logs } = fixture();
  await assert.rejects(
    processEvent("r1", {
      db,
      client: {
        releaseProductReservation: async () => {
          throw new Error("unavailable");
        },
      },
    }),
    /unavailable/,
  );
  assert.equal(logs.length, 1);
  let delivered = 0;
  await processPendingEvents({
    db,
    client: {
      releaseProductReservation: async () => {
        delivered++;
      },
    },
  });
  assert.equal(delivered, 1);
  assert.equal(logs[1].detail, "r1");
  assert.equal(logs[1].action, "PRODUCT_SYNC_COMPLETED");
});
test("acknowledged delivery is skipped on retry", async () => {
  const { db, logs } = fixture();
  let delivered = 0;
  const client = {
    releaseProductReservation: async (p, r) => {
      assert.equal(p, "p1");
      assert.equal(r, "basket1");
      delivered++;
    },
  };
  await processEvent("r1", { db, client });
  await processEvent("r1", { db, client });
  assert.equal(delivered, 1);
  assert.equal(logs.length, 2);
});
