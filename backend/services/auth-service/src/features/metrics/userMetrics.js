const { Prisma } = require("@prisma/client");
const { CUSTOMER_ROLES } = require("@reloop/shared");
const prisma = require("../../models/prismaClient");

// The only columns the customer predicate is ever built for.
const USER_ID_COLUMNS = { login: "ll.user_id", user: "u.id" };

/**
 * SQL predicate: the account in `column` is a customer (buyer or seller), not
 * staff. A user's roles are their `user_roles` rows when they have any, else
 * the legacy `users.role` — the same rule getUserRoles applies — so a buyer
 * promoted to a staff role by a role row is staff here too. The executive
 * dashboard is about the marketplace's customers, so staff logins, such as the
 * executive's own, are left out (CEO-DEC-007).
 */
function customerAccount(column) {
  const id = Prisma.raw(USER_ID_COLUMNS[column]);
  const roles = Prisma.join(CUSTOMER_ROLES);
  return Prisma.sql`(
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = ${id} AND ur.role_code IN (${roles})
    )
    OR (
      NOT EXISTS (SELECT 1 FROM user_roles ur2 WHERE ur2.user_id = ${id})
      AND EXISTS (
        SELECT 1 FROM users cu WHERE cu.id = ${id} AND cu.role IN (${roles})
      )
    )
  )`;
}

/**
 * Customer-side metrics for the Executive dashboard, bucketed to [from, to).
 * - activeUsers: distinct customer accounts with at least one login in the
 *   window (login_logs is written on every successful POST /api/auth/login).
 * - newUsers: customer accounts created in the window.
 */
async function getUserMetrics({ from, to }) {
  const [[active], [created]] = await Promise.all([
    prisma.$queryRaw`
      SELECT COUNT(DISTINCT ll.user_id)::int AS n
      FROM login_logs ll
      WHERE ll.login_at >= ${from} AND ll.login_at < ${to}
        AND ${customerAccount("login")}
    `,
    prisma.$queryRaw`
      SELECT COUNT(*)::int AS n
      FROM users u
      WHERE u.created_at >= ${from} AND u.created_at < ${to}
        AND ${customerAccount("user")}
    `,
  ]);

  return { activeUsers: active.n, newUsers: created.n };
}

/**
 * Web usage per day or month, as customers who came added up day by day
 * (CEO-DEC-007): a bucket's `activeUsers` is the sum, over its days, of the
 * customers who logged in on that day. For a day that is just that day's
 * distinct users; for a month it is the "user-days" of the month, so a person
 * who logs in on 20 days counts 20 times and a month always equals the sum of
 * its days. That keeps a month row, a year total and a sum of days in
 * agreement. Buckets are calendar days/months in `timezone`; `login_at` is a
 * zone-less TIMESTAMP holding UTC.
 */
async function getUserMetricsSeries({ from, to, granularity, timezone }) {
  const rows = await prisma.$queryRaw`
    SELECT date_trunc(${granularity}, d.day) AT TIME ZONE ${timezone} AS period,
           SUM(d.users)::int AS "activeUsers"
    FROM (
      SELECT date_trunc('day', (ll.login_at AT TIME ZONE 'UTC') AT TIME ZONE ${timezone}) AS day,
             COUNT(DISTINCT ll.user_id) AS users
      FROM login_logs ll
      WHERE ll.login_at >= ${from} AND ll.login_at < ${to}
        AND ${customerAccount("login")}
      GROUP BY 1
    ) d
    GROUP BY period
    ORDER BY period
  `;

  return rows.map((row) => ({
    period: row.period,
    activeUsers: row.activeUsers,
  }));
}

module.exports = { getUserMetrics, getUserMetricsSeries };
