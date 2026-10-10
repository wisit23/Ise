const { badRequest, conflict } = require("@reloop/shared");
const { Prisma } = require("../generated/prisma-client");

// All persisted amounts are baht, with at most two decimal places. Keep them
// as Decimal throughout arithmetic; converting to Number loses satang.
function money(value, field = "amount") {
  if (
    value === null ||
    value === undefined ||
    (typeof value !== "string" &&
      typeof value !== "number" &&
      !Prisma.Decimal.isDecimal(value)) ||
    (typeof value === "string" && !value.trim()) ||
    (typeof value === "number" && Math.abs(value) > Number.MAX_SAFE_INTEGER)
  ) {
    throw badRequest(`${field} must be a non-negative baht amount`);
  }
  let amount;
  try {
    amount = new Prisma.Decimal(value);
  } catch {
    throw badRequest(`${field} must be a non-negative baht amount`);
  }
  if (
    !amount.isFinite() ||
    amount.isNegative() ||
    amount.decimalPlaces() > 2 ||
    amount.greaterThan("9999999999999999.99")
  ) {
    throw badRequest(`${field} must fit Decimal(18,2), in baht`);
  }
  return amount;
}

function calculateOrderTotals(orders) {
  let originalAmount = new Prisma.Decimal(0);
  let ordersAmount = new Prisma.Decimal(0);
  for (const order of orders) {
    const original = money(order.originalAmount, "originalAmount");
    const final = money(order.ordersAmount, "ordersAmount");
    if (final.greaterThan(original)) {
      throw conflict(
        `order ${order.id} has a final amount above its original amount`,
      );
    }
    originalAmount = originalAmount.plus(original);
    ordersAmount = ordersAmount.plus(final);
  }
  return {
    originalAmount: money(originalAmount, "checkout.originalAmount"),
    ordersAmount: money(ordersAmount, "checkout.ordersAmount"),
  };
}

module.exports = { money, calculateOrderTotals };
