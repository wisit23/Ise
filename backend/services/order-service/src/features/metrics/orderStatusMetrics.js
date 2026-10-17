const prisma = require("../../models/prismaClient");

/**
 * How the Executive reads a paid order's status. Orders that were never paid
 * (waiting for payment, cancelled or expired before paying) are left out on
 * purpose: they are carts abandoned at the payment step, not sales.
 */
const STATUS_GROUPS = {
  completed: ["completed"],
  inProgress: ["confirmed", "shipped"],
  disputeRefund: ["disputed", "refunded"],
};
const COUNTED_STATUSES = Object.values(STATUS_GROUPS).flat();

/**
 * Paid orders placed in [from, to), counted by status group. Bucketed by
 * `created_at` like the sales figures, so `completed` equals the
 * completedOrders in /executive/metrics for the same window.
 */
async function getOrderStatusBreakdown({ from, to }) {
  const rows = await prisma.$queryRaw`
    SELECT o.status, COUNT(*)::int AS n
    FROM orders o
    WHERE o.created_at >= ${from} AND o.created_at < ${to}
      AND o.status = ANY(${COUNTED_STATUSES})
      AND EXISTS (
        SELECT 1 FROM payment p
        WHERE p.order_id = o.order_id AND p.payment_status = 'paid'
      )
    GROUP BY o.status
  `;
  const byStatus = new Map(rows.map((row) => [row.status, row.n]));
  const countOf = (statuses) =>
    statuses.reduce((total, status) => total + (byStatus.get(status) || 0), 0);

  const counts = Object.fromEntries(
    Object.entries(STATUS_GROUPS).map(([group, statuses]) => [
      group,
      countOf(statuses),
    ]),
  );
  return {
    ...counts,
    total: counts.completed + counts.inProgress + counts.disputeRefund,
  };
}

module.exports = {
  getOrderStatusBreakdown,
  STATUS_GROUPS,
  COUNTED_STATUSES,
};
