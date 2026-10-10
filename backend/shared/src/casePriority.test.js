const test = require("node:test");
const assert = require("node:assert/strict");
const { scoreCase } = require("./casePriority");

test("higher escrow amount and report history raise score", () => {
  const base = scoreCase({ isDispute: true, amount: 1000, reportCount: 0 });
  const risky = scoreCase({ isDispute: true, amount: 20000, reportCount: 3 });
  assert.ok(risky.priorityScore > base.priorityScore);
});

test("reported counterfeit requires high-priority investigation; SLA urgency keeps priority stable", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  const fraud = scoreCase({ isDispute: true, reason: "สินค้าปลอม", now });
  assert.equal(fraud.priority, "HIGH");
  const approaching = scoreCase({
    isDispute: true,
    reason: "สินค้าปลอม",
    slaExpiresAt: "2026-01-01T00:30:00Z",
    now,
  });
  assert.equal(approaching.priority, "HIGH");
  assert.ok(approaching.priorityScore > fraud.priorityScore);
});

test("persisted priority is stable even when overdue and report history is high", () => {
  const low = scoreCase({
    priority: "LOW",
    reportCount: 999,
    amount: 999999,
    reason: "fraud",
    slaExpiresAt: "2026-01-01",
    now: new Date("2026-02-01"),
  });
  const normal = scoreCase({ priority: "NORMAL" });
  assert.equal(low.priority, "LOW");
  assert.ok(low.priorityScore < normal.priorityScore);
  assert.equal(scoreCase({ priority: "CRITICAL" }).priority, "CRITICAL");
});
