const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");
const disputeModel = require("./disputeModel");
const orderModel = require("../../models/orderModel");
const router = require("./disputeChatAccessRoutes");

test("dispute owner denies stale agents and allows case parties", async (t) => {
  const previousToken = process.env.INTERNAL_SERVICE_TOKEN;
  const originalDispute = disputeModel.findById;
  const originalOrder = orderModel.findById;
  t.after(() => {
    process.env.INTERNAL_SERVICE_TOKEN = previousToken;
    disputeModel.findById = originalDispute;
    orderModel.findById = originalOrder;
  });
  process.env.INTERNAL_SERVICE_TOKEN = "unit-internal-token";
  let status = "OPEN";
  disputeModel.findById = async () => ({
    orderId: "order-1", assignedTo: "new-agent", assignedRole: "CUSTOMER_SERVICE", status,
  });
  orderModel.findById = async () => ({ buyerId: "buyer-1", sellerId: "seller-1" });
  const app = express().use("/internal", router);
  const url = (id, role, channel = "DISPUTE_BUYER") => `/internal/disputes/case-1/chat-access/${id}?role=${role}&channel=${channel}`;
  assert.equal((await request(app).get(url("buyer-1", "BUYER"))).status, 403);
  const call = (id, role, channel) => request(app).get(url(id, role, channel)).set("x-internal-token", "unit-internal-token");
  assert.deepEqual((await call("old-agent", "AGENT")).body, { allowed: false, writable: false });
  assert.deepEqual((await call("new-agent", "AGENT")).body, { allowed: true, writable: true });
  assert.deepEqual((await call("seller-1", "SELLER", "DISPUTE_SELLER")).body, { allowed: true, writable: true });
  assert.deepEqual((await call("seller-1", "SELLER")).body, { allowed: false, writable: false });
  assert.deepEqual((await call("buyer-1", "BUYER", "DISPUTE_SELLER")).body, { allowed: false, writable: false });
  assert.deepEqual((await call("admin-1", "ADMIN")).body, { allowed: true, writable: false });
  assert.deepEqual((await call("buyer-1", "BUYER", "DISPUTE")).body, { allowed: true, writable: false });
  status = "DECIDED";
  assert.deepEqual((await call("buyer-1", "BUYER")).body, { allowed: true, writable: false });
});
