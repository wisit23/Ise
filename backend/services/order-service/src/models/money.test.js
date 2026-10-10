const test = require("node:test");
const assert = require("node:assert/strict");
const { money, calculateOrderTotals } = require("./money");

test("checkout totals preserve satang across sellers and per-order discounts", () => {
  const totals = calculateOrderTotals([
    { id: "a", originalAmount: "0.10", ordersAmount: "0.05" },
    { id: "b", originalAmount: "0.20", ordersAmount: "0.15" },
  ]);
  assert.equal(totals.originalAmount.toFixed(2), "0.30");
  assert.equal(totals.ordersAmount.toFixed(2), "0.20");
});

test("money rejects missing, fractional-satang, negative and non-finite amounts", () => {
  for (const value of [
    null,
    undefined,
    "",
    " ",
    {},
    true,
    "0.001",
    -1,
    NaN,
    Infinity,
  ]) {
    assert.throws(
      () => money(value),
      (error) => error.status === 400,
    );
  }
});

test("money preserves large exact decimal input and rejects database overflow", () => {
  assert.equal(money("9999999999999999.99").toFixed(2), "9999999999999999.99");
  assert.throws(
    () => money("10000000000000000"),
    (error) => error.status === 400,
  );
  assert.throws(
    () => money(Number.MAX_SAFE_INTEGER + 1),
    (error) => error.status === 400,
  );
});

test("checkout rejects discounts that increase an order's price", () => {
  assert.throws(
    () =>
      calculateOrderTotals([
        { id: "a", originalAmount: "10.00", ordersAmount: "10.01" },
      ]),
    (error) => error.status === 409,
  );
});

test("checkout rejects aggregate overflow even when individual orders fit", () => {
  assert.throws(
    () =>
      calculateOrderTotals([
        {
          id: "a",
          originalAmount: "9999999999999999.99",
          ordersAmount: "9999999999999999.99",
        },
        { id: "b", originalAmount: "0.01", ordersAmount: "0.01" },
      ]),
    (error) => error.status === 400,
  );
});
