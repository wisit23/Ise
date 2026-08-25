const test = require("node:test");
const assert = require("node:assert/strict");
const { calculatePriority, calculateSlaDueAt } = require("./priority");

test("dispute cases are always URGENT (WF-10 step 3)", () => {
  assert.equal(calculatePriority({ isDispute: true }), "URGENT");
});

test("PAYMENT category is URGENT regardless of amount", () => {
  assert.equal(calculatePriority({ category: "PAYMENT" }), "URGENT");
});

test("high order amount is URGENT", () => {
  assert.equal(calculatePriority({ orderAmount: 10000 }), "URGENT");
  assert.equal(calculatePriority({ orderAmount: 9999 }), "NORMAL");
});

test("long wait escalates to HIGH", () => {
  assert.equal(calculatePriority({ minutesWaiting: 240 }), "HIGH");
  assert.equal(calculatePriority({ minutesWaiting: 239 }), "NORMAL");
});

test("default case is NORMAL", () => {
  assert.equal(calculatePriority({}), "NORMAL");
  assert.equal(calculatePriority(), "NORMAL");
});

test("calculateSlaDueAt adds the right offset per priority", () => {
  const from = new Date("2026-01-01T00:00:00Z");
  assert.equal(
    calculateSlaDueAt("URGENT", from).toISOString(),
    "2026-01-01T01:00:00.000Z",
  );
  assert.equal(
    calculateSlaDueAt("NORMAL", from).toISOString(),
    "2026-01-02T00:00:00.000Z",
  );
});
