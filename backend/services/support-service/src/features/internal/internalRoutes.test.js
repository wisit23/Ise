const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");
const ticketModel = require("../tickets/ticketModel");
const router = require("./internalRoutes");

test("ticket owner preserves requester history and revokes escalated CS", async (t) => {
  const previousToken = process.env.INTERNAL_SERVICE_TOKEN;
  const originalFind = ticketModel.findById;
  t.after(() => {
    process.env.INTERNAL_SERVICE_TOKEN = previousToken;
    ticketModel.findById = originalFind;
  });
  process.env.INTERNAL_SERVICE_TOKEN = "unit-internal-token";
  let status = "ESCALATED";
  ticketModel.findById = async () => ({ requesterId: "buyer-1", assigneeId: "old-agent", status });
  const app = express().use("/internal", router);
  const call = (id, role) => request(app)
    .get(`/internal/tickets/ticket-1/chat-access/${id}?role=${role}`)
    .set("x-internal-token", "unit-internal-token");
  assert.deepEqual((await call("buyer-1", "BUYER")).body, { allowed: true, writable: true });
  assert.deepEqual((await call("old-agent", "AGENT")).body, { allowed: false, writable: false });
  assert.deepEqual((await call("admin-1", "ADMIN")).body, { allowed: true, writable: true });
  status = "CLOSED";
  assert.deepEqual((await call("buyer-1", "BUYER")).body, { allowed: true, writable: false });
});
