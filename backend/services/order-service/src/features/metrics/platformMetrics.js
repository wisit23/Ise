const prisma = require("../../models/prismaClient");

// Temporary working default per docs/featureplan/executive/teachme.md
// ("platform revenue must have an explicit fee rule, not be guessed from
// price") — swap for a real fee schedule once Finance confirms one.
const PLATFORM_FEE_RATE = 0.1;

/**
 * GMV/revenue/completed-order count for orders placed in [from, to).
 * Only `completed` orders count as sales — pending/cancelled orders never
 * became revenue. Bucketed by `createdAt` (order placement), the only
 * timestamp the schema guarantees today; there is no separate paidAt/
 * completedAt field yet.
 */
async function getPlatformMetrics({ from, to }) {
  const where = {
    status: "completed",
    createdAt: { gte: from, lt: to },
  };

  const [aggregate, completedOrders] = await Promise.all([
    prisma.order.aggregate({ where, _sum: { price: true } }),
    prisma.order.count({ where }),
  ]);

  const gmv = aggregate._sum.price || 0;
  const platformRevenue = Math.round(gmv * PLATFORM_FEE_RATE);

  return { gmv, platformRevenue, completedOrders };
}

/**
 * Same figures as `getPlatformMetrics`, bucketed by day or month instead of
 * summed over the whole [from, to) window — the "how did each day of August
 * sell" report view. `date_trunc`'s first argument takes a plain value
 * (unlike a column/table name), so parameterizing it is safe and Prisma's
 * tagged-template `$queryRaw` does that automatically — no string
 * concatenation into the query.
 */
async function getPlatformMetricsSeries({ from, to, granularity }) {
  const rows = await prisma.$queryRaw`
    SELECT date_trunc(${granularity}, created_at) AS period,
           COALESCE(SUM(price) FILTER (WHERE status = 'completed'), 0)::int AS gmv,
           COUNT(*) FILTER (WHERE status = 'completed')::int AS "completedOrders"
    FROM orders
    WHERE created_at >= ${from} AND created_at < ${to}
    GROUP BY period
    ORDER BY period
  `;

  return rows.map((row) => ({
    period: row.period,
    gmv: row.gmv,
    platformRevenue: Math.round(row.gmv * PLATFORM_FEE_RATE),
    completedOrders: row.completedOrders,
  }));
}

module.exports = {
  getPlatformMetrics,
  getPlatformMetricsSeries,
  PLATFORM_FEE_RATE,
};
