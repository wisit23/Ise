const test = require("node:test");
const assert = require("node:assert/strict");
const { ID, LEGACY, TICKETS, DISPUTES, localComposeUrl } = require("./demo-cs-admin");

test("CS/Admin demo has distinct, linked case scenarios", () => {
  assert.equal(TICKETS.length, 4);
  assert.equal(DISPUTES.length, 3);
  assert.deepEqual(TICKETS.map((ticket) => ticket.status), ["NEW", "IN_PROGRESS", "ESCALATED", "CLOSED"]);
  assert.deepEqual(DISPUTES.map((dispute) => dispute.status), ["OPEN", "OPEN", "DECIDED"]);
  assert.equal(TICKETS[1].orderId, ID.orders[1]);
  assert.equal(DISPUTES[1].orderId, ID.orders[1]);
  assert.equal(new Set([...ID.tickets, ...LEGACY.tickets]).size, ID.tickets.length + LEGACY.tickets.length);
  assert.equal(new Set([...ID.disputes, ...LEGACY.disputes]).size, ID.disputes.length + LEGACY.disputes.length);
});

test("demo seed refuses unexpected hosts and database names", () => {
  const local = localComposeUrl("postgresql://u:p@postgres:5432/reloop_support", "reloop_support");
  assert.equal(new URL(local).hostname, "localhost");
  assert.throws(() => localComposeUrl("postgresql://u:p@db.example.com:5432/reloop_support", "reloop_support"));
  assert.throws(() => localComposeUrl("postgresql://u:p@localhost:5432/customer_data", "reloop_support"));
});
