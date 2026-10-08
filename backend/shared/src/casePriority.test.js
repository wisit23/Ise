const test = require("node:test");
const assert = require("node:assert/strict");
const { scoreCase } = require("./casePriority");

test("higher escrow amount and report history raise score", () => {
  const base = scoreCase({ isDispute: true, amount: 1000, reportCount: 0 });
  const risky = scoreCase({ isDispute: true, amount: 20000, reportCount: 3 });
  assert.ok(risky.priorityScore > base.priorityScore);
});

test("fraud severity starts critical and SLA urgency increases dynamically", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  const fraud = scoreCase({ isDispute: true, reason: "สินค้าปลอม", now });
  assert.equal(fraud.priority, "CRITICAL");
  const approaching = scoreCase({ isDispute: true, reason: "สินค้าปลอม", slaExpiresAt: "2026-01-01T00:30:00Z", now });
  assert.equal(approaching.priority, "CRITICAL");
  assert.ok(approaching.priorityScore > fraud.priorityScore);
});
