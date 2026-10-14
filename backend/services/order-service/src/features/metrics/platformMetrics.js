const prisma = require("../../models/prismaClient");

// Temporary working default per docs/featureplan/executive/teachme.md
// ("platform revenue must have an explicit fee rule, not be guessed from
// price") — swap for a real fee schedule once Finance confirms one.
const PLATFORM_FEE_RATE = 0.03;

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
    prisma.order.aggregate({ where, _sum: { originalAmount: true } }),
    prisma.order.count({ where }),
  ]);

  const { money } = require("../../models/money");
  const amount = money(aggregate._sum.originalAmount || 0);
  const gmv = Number(amount);
  const platformRevenue = Number(amount.times(PLATFORM_FEE_RATE).toFixed(2));

  return { gmv, platformRevenue, completedOrders };
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
  const rows = await prisma.$queryRaw`
    SELECT date_trunc(${granularity}, (created_at AT TIME ZONE 'UTC') AT TIME ZONE ${timezone})
             AT TIME ZONE ${timezone} AS period,
           COALESCE(SUM(original_amount) FILTER (WHERE status = 'completed'), 0) AS gmv,
           COUNT(*) FILTER (WHERE status = 'completed')::int AS "completedOrders"
    FROM orders
    WHERE created_at >= ${from} AND created_at < ${to}
    GROUP BY period
    ORDER BY period
  `;

  return rows.map((row) => ({
    period: row.period,
    gmv: Number(row.gmv),
    platformRevenue: Number(
      require("../../models/money")
        .money(row.gmv)
        .times(PLATFORM_FEE_RATE)
        .toFixed(2),
    ),
    completedOrders: row.completedOrders,
  }));
}

module.exports = {
  getPlatformMetrics,
  getPlatformMetricsSeries,
  PLATFORM_FEE_RATE,
};
