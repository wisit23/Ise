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
  ["seller", "confirmed", "ready_to_ship"],
  ["seller", "ready_to_ship", "shipped"],
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
  ["seller", "shipped", "completed", 403],
  // The buyer cannot skip ahead or confirm receipt before delivery.
  ["buyer", "shipped", "completed", 409],
  ["buyer", "paid", "completed", 409],
  ["buyer", "pending_payment", "completed", 409],
  ["buyer", "paid", "confirmed", 403],
  ["buyer", "confirmed", "cancelled", 409],
  ["buyer", "ready_to_ship", "cancelled", 409],
  ["buyer", "shipped", "cancelled", 409],
  // The seller must follow paid -> confirmed -> ready_to_ship -> shipped.
  ["seller", "paid", "shipped", 409],
  ["seller", "confirmed", "shipped", 409],
  ["seller", "pending_payment", "confirmed", 409],
  ["seller", "confirmed", "cancelled", 409],
  // System-only statuses.
  ["seller", "shipped", "delivered", 400],
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
  assert.equal(lifecycle.isWithinDisputeWindow(order("shipped")), false);
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

test("shipped orders older than the delivery delay become delivered", async (t) => {
  const now = new Date("2026-10-16T00:00:10Z");
  const { queries, transitions } = sweepFixture(t, [order("shipped")]);
  assert.equal(await lifecycleService.deliverShippedOrders(now), 1);
  assert.equal(queries[0].where.AND[0].status, "shipped");
  assert.equal(queries[0].where.AND[0].shippedAt.lte.toISOString(), "2026-10-16T00:00:00.000Z");
  assert.ok(queries[0].where.AND[1].payments.none, "held orders are skipped");
  assert.equal(transitions[0].status, "delivered");
  assert.deepEqual(transitions[0].expectedStatuses, ["shipped"]);
  assert.equal(transitions[0].actorId, "system");
  assert.equal(transitions[0].productSync, null);
});

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
  const { transitions } = sweepFixture(t, [order("shipped"), order("shipped", { id: "order-2" })]);
  orderModel.transitionStatusWithProductSync.mock.mockImplementationOnce(async () => {
    throw Object.assign(new Error("changed"), { status: 409 });
  });
  assert.equal(await lifecycleService.deliverShippedOrders(), 1);
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
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    res.status(err.status || 500).json({ error: err.message });
  });
  return { app, transitions };
}

test("PATCH: seller cannot mark a shipped order completed", async (t) => {
  const { app, transitions } = controllerApp(t, order("shipped"), "seller");
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

for (const state of ["confirmed", "ready_to_ship", "shipped", "disputed"]) {
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
