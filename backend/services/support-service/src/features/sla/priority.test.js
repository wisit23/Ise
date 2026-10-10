const test = require("node:test");
const assert = require("node:assert/strict");
const { calculatePriority, calculateSlaDueAt } = require("./priority");

test("impact determines priority, rather than category name, order size alone, or elapsed waiting", () => {
  assert.equal(calculatePriority({ isDispute: true }), "HIGH");
  assert.equal(calculatePriority({ category: "PAYMENT" }), "NORMAL");
  assert.equal(
    calculatePriority({ category: "PAYMENT", orderAmount: 1500 }),
    "HIGH",
  );
  assert.equal(
    calculatePriority({ category: "PAYMENT", orderAmount: 10000 }),
    "URGENT",
  );
  assert.equal(
    calculatePriority({ category: "ORDER", orderAmount: 50000 }),
    "NORMAL",
  );
  assert.equal(calculatePriority({ minutesWaiting: 240 }), "NORMAL");
  assert.equal(calculatePriority(), "NORMAL");
});
test("response and resolution have separate 24x7 targets, including weekends", () => {
  const friday = new Date("2026-10-09T16:00:00Z");
  assert.equal(
    calculateSlaDueAt("URGENT", friday, "FIRST_RESPONSE").toISOString(),
    "2026-10-09T16:30:00.000Z",
  );
  assert.equal(
    calculateSlaDueAt("URGENT", friday).toISOString(),
    "2026-10-10T04:00:00.000Z",
  );
  assert.equal(
    calculateSlaDueAt("NORMAL", friday).toISOString(),
    "2026-10-12T16:00:00.000Z",
  );
  assert.throws(() => calculateSlaDueAt("UNKNOWN", friday), RangeError);
  assert.throws(
    () => calculateSlaDueAt("NORMAL", friday, "UNKNOWN"),
    RangeError,
  );
});
