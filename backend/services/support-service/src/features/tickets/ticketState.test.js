const test = require("node:test");
const assert = require("node:assert/strict");
const { canTransition, STATUSES } = require("./ticketState");

test("NEW can move to ASSIGNED, ESCALATED or CLOSED", () => {
  assert.equal(canTransition("NEW", "ASSIGNED"), true);
  assert.equal(canTransition("NEW", "ESCALATED"), true);
  assert.equal(canTransition("NEW", "CLOSED"), true);
  assert.equal(canTransition("NEW", "RESOLVED"), false);
});

test("CLOSED is terminal", () => {
  for (const status of STATUSES) {
    assert.equal(canTransition("CLOSED", status), false);
  }
});

test("RESOLVED can bounce back to IN_PROGRESS (WF-10 step 7: user says not fixed)", () => {
  assert.equal(canTransition("RESOLVED", "IN_PROGRESS"), true);
  assert.equal(canTransition("RESOLVED", "CLOSED"), true);
});

test("unknown status has no valid transitions", () => {
  assert.equal(canTransition("BOGUS", "NEW"), false);
});
