const test = require("node:test");
const assert = require("node:assert/strict");
const { toTicket } = require("./ticketShape");

test("ticket timestamps keep receipt, assignment, escalation and closure separate", () => {
  const createdAt = new Date("2026-10-20T00:00:00Z");
  const assignedAt = new Date("2026-10-21T00:00:00Z");
  const escalatedAt = new Date("2026-10-22T00:00:00Z");
  const closedAt = new Date("2026-10-23T00:00:00Z");
  const ticket = toTicket({ id: "ticket-1", createdAt, closedAt, currentStatus: { code: "CLOSED" },
    assignments: [{ assigneeId: "staff-1", assignedAt }],
    statusHistory: [{ toStatus: { code: "ESCALATED" }, createdAt: escalatedAt }],
  });
  assert.equal(ticket.createdAt, createdAt);
  assert.equal(ticket.assignedAt, assignedAt);
  assert.equal(ticket.escalatedAt, escalatedAt);
  assert.equal(ticket.closedAt, closedAt);
  assert.equal(toTicket({ currentStatus: { code: "NEW" } }).assignedAt, null);
});
