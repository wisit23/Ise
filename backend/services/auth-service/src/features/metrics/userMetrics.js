const prisma = require("../../models/prismaClient");

/**
 * User-side metrics for the Executive dashboard, bucketed to [from, to).
 * - activeUsers: distinct accounts with at least one login in the window
 *   (login_logs is written on every successful POST /api/auth/login).
 * - newUsers: accounts created in the window.
 */
async function getUserMetrics({ from, to }) {
  const [activeLogins, newUsers] = await Promise.all([
    prisma.loginLog.findMany({
      where: { loginAt: { gte: from, lt: to } },
      select: { userId: true },
      distinct: ["userId"],
    }),
    prisma.user.count({ where: { createdAt: { gte: from, lt: to } } }),
  ]);

  return { activeUsers: activeLogins.length, newUsers };
}

/**
 * activeUsers bucketed by day or month instead of summed over [from, to) —
 * distinct-per-bucket, so a user who logs in every day of the month counts
 * once per day, not once for the whole month.
 */
async function getUserMetricsSeries({ from, to, granularity }) {
  const rows = await prisma.$queryRaw`
    SELECT date_trunc(${granularity}, login_at) AS period,
           COUNT(DISTINCT user_id)::int AS "activeUsers"
    FROM login_logs
    WHERE login_at >= ${from} AND login_at < ${to}
    GROUP BY period
    ORDER BY period
  `;

  return rows.map((row) => ({
    period: row.period,
    activeUsers: row.activeUsers,
  }));
}

module.exports = { getUserMetrics, getUserMetricsSeries };
