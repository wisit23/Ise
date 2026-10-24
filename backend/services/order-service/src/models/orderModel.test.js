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
    payment: {
      create: async ({ data }) => {
        writes.push({ payment: data });
        return data;
      },
    },
    shipping: {
      update: async (args) => {
        writes.push({ shipping: args.data });
        return args.data;
      },
    },
    productSyncJob: {
      create: async ({ data }) => {
        writes.push({ job: data });
        return { id: "sync-1", ...data };
      },
    },
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
  assert.equal(writes.length, 4);
  assert.equal(writes[1].job.action, "SET_STATUS");
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

for (const status of ["paid", "confirmed", "ready_to_ship"]) {
test(`a ${status} order cancelled by the seller records one full simulated refund`, async (t) => {
  const { writes } = fixture(t, {
    status,
    payments: [{ paymentStatus: "paid" }],
  });
  const result = await model.transitionStatusWithProductSync({
    ...cancellation,
    expectedStatuses: [status],
    actorId: "seller",
    reason: "สินค้าหมดสต็อก",
  });
  assert.equal(result.order.status, "cancelled");
  const refund = writes.find((w) => w.payment)?.payment;
  assert.equal(refund.paymentStatus, "refunded");
  assert.equal(refund.paymentAmount, "100");
  assert.equal(writes.filter((w) => w.payment).length, 1);
  const audit = writes.find((w) => w.action === "STATUS_CHANGED");
  assert.equal(JSON.parse(audit.detail).reason, "สินค้าหมดสต็อก");
});
}

test("cancelled order details expose the saved reason without exposing audit logs", () => {
  const result = model.view({ status: "cancelled", originalAmount: "100", ordersAmount: "100", logs: [{ detail: JSON.stringify({ to: "cancelled", reason: "สินค้าหมดสต็อก" }) }] });
  assert.equal(result.cancellationReason, "สินค้าหมดสต็อก");
  assert.equal(result.logs, undefined);
});

test("legacy cancellation details without a reason remain readable", () => {
  const result = model.view({ status: "cancelled", originalAmount: "100", ordersAmount: "100", logs: [{ detail: "legacy" }] });
  assert.equal(result.cancellationReason, null);
});

test("a hold appearing before the transaction blocks seller refund and relisting", async (t) => {
  const { writes } = fixture(t, { status: "ready_to_ship", payments: [{ paymentStatus: "paid", holds: [{ releaseAt: null }] }] });
  await assert.rejects(model.transitionStatusWithProductSync({ ...cancellation, actorId: "seller", expectedStatuses: ["ready_to_ship"] }), (err) => err.status === 409);
  assert.equal(writes.length, 0);
});

test("a concurrent shipment or duplicate rejection creates no refund", async (t) => {
  const { writes } = fixture(t, { status: "ready_to_ship", claimCount: 0 });
  await assert.rejects(model.transitionStatusWithProductSync({ ...cancellation, actorId: "seller", expectedStatuses: ["ready_to_ship"] }), (err) => err.status === 409);
  assert.equal(writes.some((w) => w.payment || w.job), false);
});

test("delivered and completed transitions stamp their time and need no product sync", async (t) => {
  const { writes } = fixture(t, { status: "shipped" });
  const result = await model.transitionStatusWithProductSync({
    id: "o",
    status: "delivered",
    expectedVersion: 1,
    expectedStatuses: ["shipped"],
    actorId: "system",
  });
  assert.equal(result.event, null);
  assert.ok(writes[0].data.deliveredAt instanceof Date);
  assert.equal(writes.some((w) => w.job), false);
  assert.equal(model.statusData("completed").completedAt instanceof Date, true);
  assert.equal(model.statusData("confirmed").completedAt, undefined);
});
