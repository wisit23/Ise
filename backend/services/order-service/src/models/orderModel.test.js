const test = require("node:test");
const assert = require("node:assert/strict");
const model = require("./orderModel");
const prisma = require("./prismaClient");

function fixture(
  t,
  { status = "pending_payment", payments = [], claimCount = 1 } = {},
) {
  const order = {
    id: "o",
    buyerId: "buyer",
    sellerId: "seller",
    productId: "p",
    status,
    version: 1,
    originalAmount: "100",
    ordersAmount: "100",
    payments,
  };
  const writes = [];
  const tx = {
    order: {
      findUnique: async () => order,
      updateMany: async (args) => {
        writes.push(args);
        if (claimCount)
          Object.assign(order, { status: args.data.status, version: 2 });
        return { count: claimCount };
      },
    },
    orderLog: {
      create: async ({ data }) => {
        writes.push(data);
        return { id: "event" };
      },
    },
  };
  t.mock.method(prisma, "$transaction", async (callback) => callback(tx));
  return { writes };
}

const cancellation = {
  id: "o",
  status: "cancelled",
  expectedVersion: 1,
  expectedStatuses: ["pending_payment"],
  actorId: "buyer",
  productSync: {
    action: "SET_STATUS",
    productId: "p",
    targetStatus: "available",
  },
};

test("TC10: cancellation rechecks the current paid status inside its transaction", async (t) => {
  const { writes } = fixture(t, { status: "confirmed" });
  await assert.rejects(
    model.transitionStatusWithProductSync(cancellation),
    (err) => err.status === 409,
  );
  assert.equal(writes.length, 0);
});

test("TC10: successful payment history also blocks the transactional cancellation", async (t) => {
  const { writes } = fixture(t, { payments: [{ paymentStatus: "paid" }] });
  await assert.rejects(
    model.transitionStatusWithProductSync(cancellation),
    (err) => err.status === 409,
  );
  assert.equal(writes.length, 0);
});

test("an unpaid cancellation still records the product sync and audit together", async (t) => {
  const { writes } = fixture(t);
  const result = await model.transitionStatusWithProductSync(cancellation);
  assert.equal(result.order.status, "cancelled");
  assert.equal(writes.length, 3);
  assert.equal(writes[0].where.version, 1);
  assert.deepEqual(writes[0].where.status, { in: ["pending_payment"] });
});

test("a concurrent payment/version change prevents cancellation and event creation", async (t) => {
  const { writes } = fixture(t, { claimCount: 0 });
  await assert.rejects(
    model.transitionStatusWithProductSync(cancellation),
    (err) => err.status === 409,
  );
  assert.equal(writes.length, 1);
});
