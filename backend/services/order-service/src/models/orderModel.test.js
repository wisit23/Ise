const test = require("node:test");
const assert = require("node:assert/strict");
const model = require("./orderModel");
const prisma = require("./prismaClient");

function fixture(
  t,
  { status = "pending_payment", payments = [], claimCount = 1, basketId = null } = {},
) {
  const order = {
    id: "o",
    buyerId: "buyer",
    sellerId: "seller",
    productId: "p",
    status,
    basketId,
    version: 1,
    originalAmount: "100",
    ordersAmount: "100",
    payments,
  };
  const writes = [];
  const tx = {
    basket: {
      update: async ({ data }) => { writes.push({ basket: data }); return data; },
    },
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
  return { writes, order };
}

test("the order vocabulary separates expiry from explicit cancellation", () => {
  assert.equal(model.VALID_STATUSES.includes("inbasket"), false);
  assert.ok(model.VALID_STATUSES.includes("payment_expired"));
  assert.ok(model.VALID_STATUSES.includes("seller_confirmation_expired"));
  assert.ok(model.VALID_STATUSES.includes("pending_payment"));
  assert.equal(model.VALID_STATUSES.includes("pending"), false);
});

for (const method of ["listByBuyer", "listBySeller"]) {
  test(`${method} filters by pending_payment without including terminal orders`, async (t) => {
    const queries = [];
    t.mock.method(prisma.order, "findMany", async (args) => {
      queries.push(args.where);
      return [];
    });
    // count is forwarded by the Prisma delegate proxy, not an own method.
    const delegate = prisma.order;
    Object.defineProperty(delegate, "count", { value: async () => 0, configurable: true });
    t.after(() => delete delegate.count);
    await model[method]("user", { status: "pending_payment" });
    assert.equal(queries[0].status, "pending_payment");
    await model[method]("user", { status: "payment_expired" });
    assert.equal(queries[1].status, "payment_expired");
  });
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

test("cancellation rechecks carrier handoff inside its transaction", async (t) => {
  const { writes } = fixture(t, { status: "in_transit" });
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

for (const status of ["paid", "confirmed", "ready_to_ship", "pickup_in_progress"]) {
test(`buyer cancellation of ${status} records one full simulated refund with product sync and audit`, async (t) => {
  const { writes } = fixture(t, { status, payments: [{ paymentStatus: "paid" }] });
  const result = await model.transitionStatusWithProductSync({ ...cancellation, expectedStatuses: [status] });
  assert.equal(result.order.status, "cancelled");
  const refunds = writes.filter((w) => w.payment).map((w) => w.payment);
  assert.equal(refunds.length, 1);
  assert.equal(refunds[0].paymentType, "SIMULATED_REFUND");
  assert.equal(refunds[0].paymentAmount, "100");
  assert.equal(refunds[0].paymentStatus, "refunded");
  assert.equal(writes.find((w) => w.job).job.targetStatus, "available");
});
}

test("seller confirmation winning the race prevents buyer refund or relisting", async (t) => {
  const { writes } = fixture(t, { status: "paid", claimCount: 0, payments: [{ paymentStatus: "paid" }] });
  await assert.rejects(model.transitionStatusWithProductSync({ ...cancellation, expectedStatuses: ["paid"] }), { status: 409 });
  assert.equal(writes.some((w) => w.payment || w.job), false);
});

test("delivered and completed transitions stamp their time and need no product sync", async (t) => {
  const { writes } = fixture(t, { status: "in_transit" });
  const result = await model.transitionStatusWithProductSync({
    id: "o",
    status: "delivered",
    expectedVersion: 1,
    expectedStatuses: ["in_transit"],
    actorId: "system",
  });
  assert.equal(result.event, null);
  assert.ok(writes[0].data.deliveredAt instanceof Date);
  assert.equal(writes.some((w) => w.job), false);
  assert.equal(model.statusData("completed").completedAt instanceof Date, true);
  assert.equal(model.statusData("confirmed").completedAt, undefined);
});

for (const claimCount of [1, 0]) {
  test(`seller timeout atomically refunds a paid order only after a successful claim (${claimCount})`, async (t) => {
    const { writes } = fixture(t, { status: "paid", claimCount, payments: [{ paymentStatus: "paid" }] });
    const change = { ...cancellation, status: "seller_confirmation_expired", expectedStatuses: ["paid"], actorId: "system" };
    if (!claimCount) {
      await assert.rejects(model.transitionStatusWithProductSync(change), { status: 409 });
      assert.equal(writes.some((w) => w.payment || w.job), false);
      return;
    }
    const result = await model.transitionStatusWithProductSync(change);
    assert.equal(result.order.status, "seller_confirmation_expired");
    const refunds = writes.filter((w) => w.payment).map((w) => w.payment);
    assert.equal(refunds.length, 1);
    assert.equal(refunds[0].paymentType, "SIMULATED_REFUND");
    assert.equal(refunds[0].paymentStatus, "refunded");
    assert.equal(refunds[0].paymentAmount, "100");
    assert.equal(writes.find((w) => w.job).job.targetStatus, "available");
  });
}

test("unpaid expiration releases inventory without a simulated refund", async (t) => {
  const { writes } = fixture(t);
  const result = await model.transitionStatusWithProductSync({
    ...cancellation, status: "payment_expired", actorId: "system",
    productSync: { action: "RELEASE_RESERVATION", productId: "p", reservationId: "basket" },
  });
  assert.equal(result.order.status, "payment_expired");
  assert.equal(writes.some((w) => w.payment), false);
  assert.equal(writes.find((w) => w.job).job.action, "RELEASE_RESERVATION");
  const log = writes.find((w) => w.action === "STATUS_CHANGED");
  assert.equal(JSON.parse(log.detail).to, "payment_expired");
});

test("basket expiry sweep expires both order and basket and processes inventory release", async (t) => {
  const { writes, order } = fixture(t, { basketId: "basket" });
  order.campaignId = "voucher";
  t.mock.method(prisma.order, "findMany", async ({ where }) => {
    assert.equal(where.status, "pending_payment");
    assert.ok(where.basket.unlockAt.lte instanceof Date);
    return [order];
  });
  const sync = require("../services/productSyncService");
  const processed = [];
  t.mock.method(sync, "processEvent", async (id) => processed.push(id));
  const released = [];
  assert.equal(await model.cleanExpiredOrders({ releaseVoucher: async (...args) => released.push(args) }), 1);
  assert.equal(order.status, "payment_expired");
  assert.deepEqual(writes.find((w) => w.basket).basket, { status: "expired" });
  assert.equal(writes.find((w) => w.job).job.action, "RELEASE_RESERVATION");
  assert.equal(writes.some((w) => w.payment), false);
  assert.equal(processed.length, 1);
  assert.equal(released[0][0], "voucher");
});

test("auction payment expires exactly at the deadline with a version guard", async (t) => {
  const { writes, order } = fixture(t);
  const now = new Date("2026-10-23T12:00:00Z");
  Object.assign(order, { orderType: "AUCTION", paymentDeadlineAt: now });
  assert.equal((await model.claimExpiredAuctionOrder({ id: order.id, expectedVersion: 1, now: new Date(now.getTime() - 1) })).status, "pending_payment");
  assert.equal(writes.length, 0);
  const expired = await model.claimExpiredAuctionOrder({ id: order.id, expectedVersion: 1, now });
  assert.equal(expired.status, "payment_expired");
  assert.equal(writes[0].where.version, 1);
  assert.equal(writes[0].where.status, "pending_payment");
  assert.equal(writes.some((w) => w.payment), false);
  const count = writes.length;
  await model.claimExpiredAuctionOrder({ id: order.id, expectedVersion: 1, now });
  assert.equal(writes.length, count, "retry does not expire twice");
});

test("auction expiration losing the payment race does not log or refund", async (t) => {
  const { writes, order } = fixture(t, { claimCount: 0 });
  const now = new Date();
  Object.assign(order, { orderType: "AUCTION", paymentDeadlineAt: now });
  assert.equal(await model.claimExpiredAuctionOrder({ id: order.id, expectedVersion: 1, now }), null);
  assert.equal(writes.length, 1);
  assert.equal(writes.some((w) => w.payment || w.action), false);
});
