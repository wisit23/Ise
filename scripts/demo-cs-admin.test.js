const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ID, LEGACY, TICKETS, DISPUTES, localComposeUrl } = require("./demo-cs-admin");

test("CS/Admin demo has distinct, linked case scenarios", () => {
  assert.equal(TICKETS.length, 4);
  assert.equal(DISPUTES.length, 4);
  assert.deepEqual(TICKETS.map((ticket) => ticket.status), ["NEW", "IN_PROGRESS", "ESCALATED", "CLOSED"]);
  assert.deepEqual(DISPUTES.map((dispute) => dispute.status), ["OPEN", "OPEN", "OPEN", "DECIDED"]);
  assert.equal(DISPUTES[2].assignedRole, "ADMIN");
  assert.equal(TICKETS[1].orderId, ID.orders[1]);
  assert.equal(DISPUTES[1].orderId, ID.orders[1]);
  assert.equal(new Set([...ID.tickets, ...LEGACY.tickets]).size, ID.tickets.length + LEGACY.tickets.length);
  assert.equal(new Set([...ID.disputes, ...LEGACY.disputes]).size, ID.disputes.length + LEGACY.disputes.length);
});

test("demo delegates order projections and Support state/history to owning facades", () => {
  const source = fs.readFileSync(path.join(__dirname, "demo-cs-admin.js"), "utf8");
  assert.match(source, /erClient"\)\.wrapClient\(rawOrder\)/);
  assert.match(source, /ticketModel\.recordChatMessage/);
  assert.match(source, /include: \{ chatLink: true, currentStatus: true \}/);
  assert.doesNotMatch(source, /supportTicket\.update\([^)]*chatResponderId/s);
  assert.doesNotMatch(source, /messages: true/);
  assert.match(source, /ticketModel\.assign\(\s*\{[\s\S]*?assignedAt:[\s\S]*?\},\s*support,\s*\)/);
  assert.match(source, /ticketModel\.transitionStatus\(\s*\{[\s\S]*?\},\s*support,\s*\)/);
});

test("demo seed refuses unexpected hosts and database names", () => {
  const local = localComposeUrl("postgresql://u:p@postgres:5432/reloop_support", "reloop_support");
  assert.equal(new URL(local).hostname, "localhost");
  assert.throws(() => localComposeUrl("postgresql://u:p@db.example.com:5432/reloop_support", "reloop_support"));
  assert.throws(() => localComposeUrl("postgresql://u:p@localhost:5432/customer_data", "reloop_support"));
});
