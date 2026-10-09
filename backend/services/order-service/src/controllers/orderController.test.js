const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");
const controller = require("./orderController");
const orderModel = require("../models/orderModel");
const productSync = require("../services/productSyncService");
const chat = require("../services/chatClient");
const activities = require("../services/buyerActivityClient");

function cancellationFixture(t, status, payments = [], checkout = null) {
  const order = {
    id: "order-1",
    buyerId: "buyer",
    sellerId: "seller",
    productId: "product",
    status,
    version: 1,
    payments,
    checkout,
  };
  const transitions = [];
  t.mock.method(orderModel, "findById", async () => order);
  t.mock.method(
    orderModel,
    "transitionStatusWithProductSync",
    async (input) => {
      transitions.push(input);
      return {
        order: { ...order, status: input.status },
        event: { id: "event" },
      };
    },
  );
  t.mock.method(productSync, "processEvent", async () => {});
  t.mock.method(chat, "notifyOrderStatusChanged", async () => {});
  t.mock.method(activities, "recordOrderActivity", async () => {});
  const app = express();
  app.use(express.json());
  app.patch("/:id/status", (req, res, next) => {
    req.userId = "buyer";
    controller.updateStatus(req, res, next);
  });
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    res.status(err.status || 500).json({ error: err.message });
  });
  return { app, transitions };
}

for (const status of ["confirmed", "shipped", "completed", "refunded"]) {
  test(`TC10: direct cancellation of ${status} is rejected before any side effect`, async (t) => {
    const { app, transitions } = cancellationFixture(t, status);
    const res = await request(app)
      .patch("/order-1/status")
      .send({ status: "cancelled" });
    assert.equal(res.status, 409);
    assert.match(res.body.error, /ข้อพิพาท/);
    assert.equal(transitions.length, 0);
    assert.equal(productSync.processEvent.mock.callCount(), 0);
    assert.equal(chat.notifyOrderStatusChanged.mock.callCount(), 0);
  });
}

test("TC10: a successful payment also blocks cancellation if status was reverted", async (t) => {
  const { app, transitions } = cancellationFixture(t, "pending_payment", [
    { paymentStatus: "paid" },
  ]);
  const res = await request(app)
    .patch("/order-1/status")
    .send({ status: "cancelled" });
  assert.equal(res.status, 409);
  assert.equal(transitions.length, 0);
});

for (const status of ["processing", "paid"]) {
  test(`TC10: ${status} checkout blocks cancellation before local payment records are read`, async (t) => {
    const { app, transitions } = cancellationFixture(t, "pending_payment", [], {
      status,
    });
    const res = await request(app)
      .patch("/order-1/status")
      .send({ status: "cancelled" });
    assert.equal(res.status, 409);
    assert.equal(transitions.length, 0);
  });
}

for (const status of ["pending", "pending_payment"]) {
  test(`unpaid ${status} cancellation still succeeds`, async (t) => {
    const { app, transitions } = cancellationFixture(t, status);
    const res = await request(app)
      .patch("/order-1/status")
      .send({ status: "cancelled" });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "cancelled");
    assert.equal(transitions.length, 1);
  });
}
