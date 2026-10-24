const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");
const lifecycle = require("./orderLifecycle");
const lifecycleService = require("./orderLifecycleService");
const controller = require("../controllers/orderController");
const orderModel = require("../models/orderModel");
const prisma = require("../models/prismaClient");
const productSync = require("./productSyncService");
const productClient = require("./productClient");
const chat = require("./chatClient");
const activities = require("./buyerActivityClient");

const order = (status, extra = {}) => ({
  id: "order-1",
  buyerId: "buyer",
  sellerId: "seller",
  productId: "product",
  reservationId: "basket-1",
  originalAmount: "100",
  ordersAmount: "100",
  status,
  version: 4,
  payments: [],
  ...extra,
});

const allowed = [
  ["seller", "paid", "confirmed"],
  ["seller", "paid", "cancelled"],
  ["seller", "confirmed", "cancelled"],
  ["seller", "ready_to_ship", "cancelled"],
  ["seller", "confirmed", "ready_to_ship"],
  ["seller", "ready_to_ship", "pickup_in_progress"],
  ["seller", "pickup_in_progress", "in_transit"],
  ["buyer", "delivered", "completed"],
  ["seller", "pending_payment", "cancelled"],
  ["buyer", "pending_payment", "cancelled"],
  ["buyer", "paid", "cancelled"],
];
for (const [actor, from, to] of allowed) {
  test(`${actor} may move an order from ${from} to ${to}`, () => {
    assert.equal(
      lifecycle.assertParticipantTransition(order(from), actor, to),
      actor,
    );
  });
}

const rejected = [
  // The seller can never close the sale on the buyer's behalf.
  ["seller", "delivered", "completed", 403],
  ["seller", "in_transit", "completed", 403],
  // The buyer cannot skip ahead or confirm receipt before delivery.
  ["buyer", "in_transit", "completed", 409],
  ["buyer", "paid", "completed", 409],
  ["buyer", "pending_payment", "completed", 409],
  ["buyer", "paid", "confirmed", 403],
  ["buyer", "confirmed", "cancelled", 409],
  ["buyer", "ready_to_ship", "cancelled", 409],
  ["buyer", "in_transit", "cancelled", 409],
  ["buyer", "pickup_in_progress", "cancelled", 409],
  // Pickup is required; neither shipping transition belongs to buyers.
  ["seller", "paid", "in_transit", 409],
  ["seller", "confirmed", "in_transit", 409],
  ["seller", "ready_to_ship", "in_transit", 409],
  ["buyer", "ready_to_ship", "pickup_in_progress", 403],
  ["buyer", "pickup_in_progress", "in_transit", 403],
  ["seller", "ready_to_ship", "shipped", 400],
  ["seller", "pending_payment", "confirmed", 409],
  ["seller", "shipped", "cancelled", 409],
  ["seller", "delivered", "cancelled", 409],
  ["buyer", "confirmed", "cancelled", 409],
  ["buyer", "ready_to_ship", "cancelled", 409],
  // System-only statuses.
  ["seller", "in_transit", "delivered", 400],
  ["buyer", "pending_payment", "paid", 400],
  ["buyer", "pending_payment", "payment_expired", 400],
  ["seller", "paid", "seller_confirmation_expired", 400],
  ["buyer", "payment_expired", "cancelled", 409],
  ["seller", "seller_confirmation_expired", "confirmed", 409],
  ["buyer", "pending", "cancelled", 409],
  ["buyer", "completed", "refunded", 400],
];
for (const [actor, from, to, status] of rejected) {
  test(`${actor} may not move an order from ${from} to ${to}`, () => {
    assert.throws(
      () => lifecycle.assertParticipantTransition(order(from), actor, to),
      (err) => err.status === status,
    );
  });
}

test("dispute window is 14 days from delivery, falling back to completion", () => {
  const deliveredAt = new Date("2026-10-01T00:00:00Z");
  const day = 24 * 60 * 60 * 1000;
  const delivered = order("completed", { deliveredAt });
  assert.equal(
    lifecycle.isWithinDisputeWindow(delivered, new Date(deliveredAt.getTime() + 13 * day)),
    true,
  );
  assert.equal(
    lifecycle.isWithinDisputeWindow(delivered, new Date(deliveredAt.getTime() + 14 * day)),
    false,
  );
  assert.equal(
    lifecycle.isWithinDisputeWindow(order("completed", { completedAt: deliveredAt }), new Date(deliveredAt.getTime() + day)),
    true,
  );
  assert.equal(lifecycle.isWithinDisputeWindow(order("in_transit")), false);
});

test("timing defaults are configurable through the environment", (t) => {
  assert.equal(lifecycle.timing.deliveryDelayMs(), 10_000);
  assert.equal(lifecycle.timing.autoCompleteMs(), 14 * 24 * 60 * 60 * 1000);
  assert.equal(lifecycle.timing.sellerConfirmTimeoutMs(), 24 * 60 * 60 * 1000);
  process.env.ORDER_DELIVERY_DELAY_MS = "0";
  t.after(() => delete process.env.ORDER_DELIVERY_DELAY_MS);
  assert.equal(lifecycle.timing.deliveryDelayMs(), 0);
});

test("a refunded cancellation relists the sold product instead of releasing the reservation", () => {
  for (const status of ["confirmed", "ready_to_ship"]) {
    const sync = lifecycleService.productSyncFor(order(status), "cancelled", "X");
    assert.equal(sync.action, "SET_STATUS");
    assert.equal(sync.targetStatus, "available");
  }
  assert.equal(
    lifecycleService.productSyncFor(order("paid"), "cancelled", "X").action,
    "SET_STATUS",
  );
  assert.equal(
    lifecycleService.productSyncFor(order("paid"), "cancelled", "X").targetStatus,
    "available",
  );
  assert.equal(
    lifecycleService.productSyncFor(order("pending_payment"), "cancelled", "X").action,
    "RELEASE_RESERVATION",
  );
  assert.equal(
    lifecycleService.productSyncFor(order("delivered"), "completed", "X").targetStatus,
    "sold",
  );
  assert.equal(lifecycleService.productSyncFor(order("paid"), "confirmed", "X"), null);
});

function mockEffects(t) {
  const transitions = [];
  t.mock.method(orderModel, "transitionStatusWithProductSync", async (input) => {
    transitions.push(input);
    return {
      order: { ...order(input.status), id: input.id },
      event: input.productSync ? { id: `event-${input.id}` } : null,
    };
  });
  t.mock.method(productSync, "processEvent", async () => {});
  t.mock.method(productClient, "releaseVoucher", async () => {});
  t.mock.method(productClient, "completeVoucher", async () => {});
  t.mock.method(chat, "notifyOrderStatusChanged", async () => {});
  t.mock.method(activities, "recordOrderActivity", async () => {});
  return transitions;
}

function sweepFixture(t, rows) {
  const queries = [];
  t.mock.method(prisma.order, "findMany", async (query) => {
    queries.push(query);
    return rows;
  });
  return { queries, transitions: mockEffects(t) };
}

test("in-transit orders older than the handoff delay become delivered", async (t) => {
  const now = new Date("2026-10-16T00:00:10Z");
  const { queries, transitions } = sweepFixture(t, [order("in_transit")]);
  assert.equal(await lifecycleService.deliverInTransitOrders(now), 1);
  assert.equal(queries[0].where.AND[0].status, "in_transit");
  assert.equal(queries[0].where.AND[0].shippedAt.lte.toISOString(), "2026-10-16T00:00:00.000Z");
  assert.ok(queries[0].where.AND[1].payments.none, "held orders are skipped");
  assert.equal(transitions[0].status, "delivered");
  assert.deepEqual(transitions[0].expectedStatuses, ["in_transit"]);
  assert.equal(transitions[0].actorId, "system");
  assert.equal(transitions[0].productSync, null);
});

test("pickup never auto-delivers, even with an old shippedAt", async (t) => {
  const rows = [order("pickup_in_progress", { shippedAt: new Date(0) }), order("in_transit", { shippedAt: new Date(0) })];
  const transitions = mockEffects(t);
  t.mock.method(prisma.order, "findMany", async ({ where }) => rows.filter((row) =>
    row.status === where.AND[0].status && row.shippedAt <= where.AND[0].shippedAt.lte));
  assert.equal(await lifecycleService.deliverInTransitOrders(new Date()), 1);
  assert.deepEqual(transitions.map((input) => input.expectedStatuses), [["in_transit"]]);
});

for (const [from, to, actor, extra, expected] of [
  ["ready_to_ship", "in_transit", "seller", {}, 409],
  ["ready_to_ship", "pickup_in_progress", "buyer", {}, 403],
  ["pickup_in_progress", "in_transit", "buyer", {}, 403],
  ["ready_to_ship", "pickup_in_progress", "seller", { payoutHeld: true }, 409],
  ["pickup_in_progress", "in_transit", "seller", { payoutHeld: true }, 409],
  ["disputed", "in_transit", "seller", {}, 409],
]) {
  test(`PATCH ${actor}: ${from} -> ${to} rejects before shipping writes (${expected})`, async (t) => {
    const { app, transitions } = controllerApp(t, order(from, extra), actor);
    let transactions = 0;
    t.mock.method(prisma, "$transaction", async () => { transactions++; });
    const res = await request(app).patch("/order-1/status").send({ status: to, company: "Carrier", trackingNumber: "TRK" });
    assert.equal(res.status, expected);
    assert.equal(transitions.length, 0);
    assert.equal(transactions, 0);
  });
}

test("delivered orders older than 14 days are completed like a buyer confirmation", async (t) => {
  const now = new Date("2026-10-15T00:00:00Z");
  const { queries, transitions } = sweepFixture(t, [order("delivered", { campaignId: "c1" })]);
  assert.equal(await lifecycleService.completeDeliveredOrders(now), 1);
  assert.equal(queries[0].where.AND[0].deliveredAt.lte.toISOString(), "2026-10-01T00:00:00.000Z");
  assert.equal(transitions[0].status, "completed");
  assert.equal(transitions[0].productSync.targetStatus, "sold");
  assert.equal(productClient.completeVoucher.mock.callCount(), 1);
  assert.equal(activities.recordOrderActivity.mock.calls[0].arguments[1], "ORDER_COMPLETED");
  assert.equal(productSync.processEvent.mock.callCount(), 1);
});

test("paid orders the seller ignored for a day expire and are relisted", async (t) => {
  const now = new Date("2026-10-16T00:00:00Z");
  const { queries, transitions } = sweepFixture(t, [order("paid")]);
  assert.equal(await lifecycleService.cancelUnconfirmedOrders(now), 1);
  assert.equal(queries[0].where.AND[0].status, "paid");
  assert.equal(
    queries[0].where.AND[0].payments.some.paidAt.lte.toISOString(),
    "2026-10-15T00:00:00.000Z",
  );
  assert.equal(transitions[0].status, "seller_confirmation_expired");
  assert.deepEqual(transitions[0].expectedStatuses, ["paid"]);
  assert.equal(transitions[0].productSync.action, "SET_STATUS");
  assert.equal(transitions[0].productSync.targetStatus, "available");
  assert.equal(chat.notifyOrderStatusChanged.mock.calls[0].arguments[1], "seller_confirmation_expired");
  assert.equal(activities.recordOrderActivity.mock.calls[0].arguments[1], "ORDER_CANCELLED");
});

test("a sweep skips an order a participant changed first", async (t) => {
  const { transitions } = sweepFixture(t, [order("in_transit"), order("in_transit", { id: "order-2" })]);
  orderModel.transitionStatusWithProductSync.mock.mockImplementationOnce(async () => {
    throw Object.assign(new Error("changed"), { status: 409 });
  });
  assert.equal(await lifecycleService.deliverInTransitOrders(), 1);
  assert.equal(transitions.length, 1);
});

function controllerApp(t, current, userId) {
  t.mock.method(orderModel, "findById", async () => current);
  const transitions = mockEffects(t);
  const app = express();
  app.use(express.json());
  app.patch("/:id/status", (req, res, next) => {
    req.userId = userId;
    controller.updateStatus(req, res, next);
  });
  app.post("/:id/reject", (req, res, next) => {
    req.userId = userId;
    controller.rejectOrder(req, res, next);
  });
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    res.status(err.status || 500).json({ error: err.message });
  });
  return { app, transitions };
}

test("PATCH: seller cannot mark an in-transit order completed", async (t) => {
  const { app, transitions } = controllerApp(t, order("in_transit"), "seller");
  const res = await request(app).patch("/order-1/status").send({ status: "completed" });
  assert.equal(res.status, 403);
  assert.equal(transitions.length, 0);
});

test("PATCH: buyer cannot complete an order that was never paid", async (t) => {
  const { app, transitions } = controllerApp(t, order("pending_payment"), "buyer");
  const res = await request(app).patch("/order-1/status").send({ status: "completed" });
  assert.equal(res.status, 409);
  assert.equal(transitions.length, 0);
});

test("PATCH: seller requests pickup then hands off through the transactional shipping service", async (t) => {
  const current = order("ready_to_ship", { shipping: { status: "pending", addressId: "addr", addressSnapshot: { recipientName: "Buyer" } } });
  const { app, transitions } = controllerApp(t, current, "seller");
  const logs = [];
  let transactions = 0;
  t.mock.method(prisma, "$transaction", async (callback) => {
    transactions++;
    return callback({
      order: {
        findUnique: async () => structuredClone(current),
        updateMany: async ({ where, data }) => {
          assert.equal(where.version, current.version);
          assert.equal(where.status, current.status);
          const { version, ...fields } = data;
          Object.assign(current, fields);
          current.version += version.increment;
          return { count: 1 };
        },
      },
      shipping: { update: async ({ data }) => Object.assign(current.shipping, data) },
      orderLog: { create: async ({ data }) => logs.push(data) },
    });
  });
  const pickup = await request(app).patch("/order-1/status").send({ status: "pickup_in_progress", version: 4 });
  assert.equal(pickup.status, 200, JSON.stringify(pickup.body));
  assert.equal(pickup.body.shipping.status, "pickup_in_progress");
  assert.equal(pickup.body.shippedAt, undefined);
  const missingTracking = await request(app).patch("/order-1/status").send({ status: "in_transit", version: 5 });
  assert.equal(missingTracking.status, 400);
  assert.equal(transactions, 1);
  const handoff = await request(app).patch("/order-1/status").send({ status: "in_transit", version: 5, company: " Carrier ", trackingNumber: " TRK12345 " });
  assert.equal(handoff.status, 200, JSON.stringify(handoff.body));
  assert.equal(handoff.body.status, "in_transit");
  assert.equal(handoff.body.shipping.status, "in_transit");
  assert.equal(handoff.body.shipping.company, "Carrier");
  assert.equal(handoff.body.shipping.trackingNumber, "TRK12345");
  assert.deepEqual(handoff.body.shipping.addressSnapshot, { recipientName: "Buyer" });
  assert.ok(handoff.body.shippedAt);
  assert.equal(transactions, 2);
  assert.deepEqual(logs.map((log) => log.action), ["PICKUP_REQUESTED", "IN_TRANSIT"]);
  assert.equal(transitions.length, 0, "shipping uses its atomic service, not a status-only update");
  assert.equal(chat.notifyOrderStatusChanged.mock.calls[1].arguments[0].shipping.trackingNumber, "TRK12345");
});

test("PATCH: buyer confirms receipt of a delivered order", async (t) => {
  const { app, transitions } = controllerApp(t, order("delivered"), "buyer");
  const res = await request(app).patch("/order-1/status").send({ status: "completed" });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "completed");
  assert.deepEqual(transitions[0].expectedStatuses, ["delivered"]);
});

test("PATCH: seller accepts a paid order without touching the product", async (t) => {
  const { app, transitions } = controllerApp(t, order("paid"), "seller");
  const res = await request(app).patch("/order-1/status").send({ status: "confirmed" });
  assert.equal(res.status, 200);
  assert.equal(transitions[0].productSync, null);
  assert.equal(productSync.processEvent.mock.callCount(), 0);
});

test("PATCH: seller rejects a paid order, which relists the product", async (t) => {
  const { app, transitions } = controllerApp(t, order("paid"), "seller");
  const res = await request(app).patch("/order-1/status").send({ status: "cancelled" });
  assert.equal(res.status, 200);
  assert.equal(transitions[0].productSync.targetStatus, "available");
});

test("PATCH: buyer cancels a paid order before preparation using refund and relist flow", async (t) => {
  const { app, transitions } = controllerApp(t, order("paid", {
    payments: [{ paymentStatus: "paid" }],
  }), "buyer");
  const res = await request(app).patch("/order-1/status").send({ status: "cancelled" });
  assert.equal(res.status, 200);
  assert.equal(transitions[0].status, "cancelled");
  assert.deepEqual(transitions[0].expectedStatuses, ["paid"]);
  assert.equal(transitions[0].expectedVersion, 4);
  assert.equal(transitions[0].productSync.targetStatus, "available");
  assert.equal(chat.notifyOrderStatusChanged.mock.calls[0].arguments[2].actorId, "buyer");
});

for (const state of ["confirmed", "ready_to_ship", "pickup_in_progress", "in_transit", "disputed"]) {
  test(`PATCH: buyer cancellation is rejected after preparation or hold (${state})`, async (t) => {
    const { app, transitions } = controllerApp(t, order(state), "buyer");
    const res = await request(app).patch("/order-1/status").send({ status: "cancelled" });
    assert.equal(res.status, 409);
    assert.equal(transitions.length, 0);
  });
}

test("PATCH: a held paid order cannot be cancelled by the buyer", async (t) => {
  const { app, transitions } = controllerApp(t, order("paid", { payoutHeld: true }), "buyer");
  const res = await request(app).patch("/order-1/status").send({ status: "cancelled" });
  assert.equal(res.status, 409);
  assert.equal(transitions.length, 0);
});

test("PATCH: a held order cannot be accepted", async (t) => {
  const { app, transitions } = controllerApp(t, order("paid", { payoutHeld: true }), "seller");
  const res = await request(app).patch("/order-1/status").send({ status: "confirmed" });
  assert.equal(res.status, 409);
  assert.equal(transitions.length, 0);
});

for (const status of ["paid", "confirmed", "ready_to_ship"]) {
  test(`POST: seller may reject ${status} and relist with the refund lifecycle`, async (t) => {
    const { app, transitions } = controllerApp(t, order(status, { payments: [{ paymentStatus: "paid" }] }), "seller");
    const res = await request(app).post("/order-1/reject").send({ reason: "สินค้าชำรุดก่อนจัดส่ง" });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "cancelled");
    assert.equal(transitions[0].productSync.action, "SET_STATUS");
    assert.equal(transitions[0].productSync.targetStatus, "available");
    assert.deepEqual(transitions[0].expectedStatuses, [status]);
    assert.equal(transitions[0].reason, "สินค้าชำรุดก่อนจัดส่ง");
    assert.equal(chat.notifyOrderStatusChanged.mock.calls[0].arguments[2].reason, "สินค้าชำรุดก่อนจัดส่ง");
  });
}

for (const extra of [{ payoutHeld: true }, { paymentSimulationStatus: "ON_HOLD" }, { status: "disputed" }]) {
  test(`POST: seller rejection respects hold or dispute ${JSON.stringify(extra)}`, async (t) => {
    const { app, transitions } = controllerApp(t, order("ready_to_ship", extra), "seller");
    const res = await request(app).post("/order-1/reject").send({});
    assert.equal(res.status, 409);
    assert.equal(transitions.length, 0);
  });
}
