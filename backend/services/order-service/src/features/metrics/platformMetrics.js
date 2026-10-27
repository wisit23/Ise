const { SLOT_GRANULARITY, SLOT_MINUTES } = require("@reloop/shared");
const { Prisma } = require("../../generated/prisma-client");
const prisma = require("../../models/prismaClient");
const { money } = require("../../models/money");
const { getPlatformFeeRate } = require("./feeConfig");

// orders.order_type of an order won at auction; every other order is a purchase.
const AUCTION_ORDER_TYPE = "AUCTION";
// The only order status that counts as a sale in every Executive figure.
const COMPLETED_STATUS = "completed";

/** The platform's cut of a paid amount, to the satang. */
const feeOf = (amount, feeRate) =>
  Number(money(amount).times(feeRate).toFixed(2));

/**
 * GMV/revenue/completed-order count for orders placed in [from, to).
 * Only `completed` orders count as sales — pending/cancelled orders never
 * became revenue. Bucketed by `createdAt` (order placement), the only
 * timestamp the schema guarantees today; there is no separate paidAt/
 * completedAt field yet.
 *
 * GMV is what the buyer paid: `orders_amount`, after any coupon (CEO-DEC-005).
 * It matches payment.payment_amount and the net amount campaign attribution
 * records; `original_amount` is the pre-coupon list price. Platform revenue is
 * the fee rate applied to that same paid amount.
 */
async function getPlatformMetrics({ from, to }) {
  const where = {
    status: COMPLETED_STATUS,
    createdAt: { gte: from, lt: to },
  };

  const groups = await prisma.order.groupBy({
    by: ["orderType"],
    where,
    _sum: { ordersAmount: true },
    _count: { _all: true },
  });

  // Sales split by how they were made: an auction win, or everything else
  // bought directly. Purchases are the remainder, so the two always add up to
  // the GMV even if another order type appears later (CEO-DEC-010).
  const total = groups.reduce(
    (sum, g) => sum.plus(g._sum.ordersAmount || 0),
    money(0),
  );
  const auction = groups
    .filter((g) => g.orderType === AUCTION_ORDER_TYPE)
    .reduce((sum, g) => sum.plus(g._sum.ordersAmount || 0), money(0));
  const completedOrders = groups.reduce((sum, g) => sum + g._count._all, 0);

  return {
    gmv: Number(total),
    gmvPurchase: Number(total.minus(auction)),
    gmvAuction: Number(auction),
    platformRevenue: feeOf(total, getPlatformFeeRate()),
    completedOrders,
  };
}

/**
 * Same figures as `getPlatformMetrics`, bucketed by day or month instead of
 * summed over the whole [from, to) window — the "how did each day of August
 * sell" report view. `date_trunc`'s first argument and the zone name are
 * plain values (unlike a column/table name), so parameterizing them is safe
 * and Prisma's tagged-template `$queryRaw` does that automatically — no
 * string concatenation into the query.
 *
 * `created_at` is a zone-less TIMESTAMP holding UTC, so it is read as UTC,
 * truncated on the report zone's wall clock (a Bangkok day starts at 00:00
 * Bangkok, not 00:00 UTC), and the bucket start converted back to an instant.
 */
async function getPlatformMetricsSeries({ from, to, granularity, timezone }) {
  const feeRate = getPlatformFeeRate();
  // created_at is a zone-less TIMESTAMP holding UTC: read it as UTC, then as
  // the report zone's wall clock.
  const local = Prisma.sql`(created_at AT TIME ZONE 'UTC') AT TIME ZONE ${timezone}`;
  // Day slots start every SLOT_MINUTES from 00:00 local time; day and month
  // buckets are plain date_trunc on the same wall clock.
  const bucket =
    granularity === SLOT_GRANULARITY
      ? Prisma.sql`date_trunc('day', ${local}) + (FLOOR((EXTRACT(HOUR FROM ${local}) * 60 + EXTRACT(MINUTE FROM ${local})) / ${SLOT_MINUTES})::int * ${SLOT_MINUTES}) * INTERVAL '1 minute'`
      : Prisma.sql`date_trunc(${granularity}, ${local})`;
  const rows = await prisma.$queryRaw`
    SELECT (${bucket}) AT TIME ZONE ${timezone} AS period,
           COALESCE(SUM(orders_amount), 0) AS gmv,
           COUNT(*)::int AS "completedOrders"
    FROM orders
    WHERE status = ${COMPLETED_STATUS}
      AND created_at >= ${from} AND created_at < ${to}
    GROUP BY period
    ORDER BY period
  `;

  return rows.map((row) => ({
    period: row.period,
    gmv: Number(row.gmv),
    platformRevenue: feeOf(row.gmv, feeRate),
    completedOrders: row.completedOrders,
  }));
}

/**
 * When the first sale happened: the earliest placement time among completed
 * orders, the same orders (and the same clock) that make up GMV. Null while
 * nothing has sold yet. The reports use it to offer only years that can hold
 * data instead of a fixed start year.
 */
async function getFirstSaleAt() {
  const result = await prisma.order.aggregate({
    where: { status: COMPLETED_STATUS },
    _min: { createdAt: true },
  });
  return result._min.createdAt;
}

module.exports = {
  getPlatformMetrics,
  getFirstSaleAt,
  getPlatformMetricsSeries,
  COMPLETED_STATUS,
};
