const {
  badRequest,
  forbidden,
  isStaff,
  effectiveStaffRole,
  customerServiceClientConfig,
} = require("@reloop/shared");
const { Prisma } = require("../../generated/prisma-client");
const prisma = require("../../models/prismaClient");
const { queueFilter } = require("./ticketModel");

async function readTicketTrend(
  { role, userId, days },
  db = prisma,
  now = new Date(),
) {
  const { timeZone } = customerServiceClientConfig.dashboard;
  const access = queueFilter({ role, scope: "all", assigneeId: userId });
  const bounds = Prisma.sql`t.created_at >= (((${now}::timestamptz AT TIME ZONE ${timeZone})::date - (${days}::int - 1))::timestamp AT TIME ZONE ${timeZone}) AND t.created_at <= ${now}::timestamptz`;
  const filter = access.sql
    ? Prisma.sql`${access} AND ${bounds}`
    : Prisma.sql`WHERE ${bounds}`;
  // Aggregate all visible cases, including empty dates, rather than sampling a queue page.
  return db.$queryRaw(Prisma.sql`
    WITH dates AS (
      SELECT ((${now}::timestamptz AT TIME ZONE ${timeZone})::date - (${days}::int - 1) + n) AS day
      FROM generate_series(0, ${days}::int - 1) n
    ), visible AS (
      SELECT t.id, t.created_at FROM support_tickets t
      JOIN ticket_statuses s ON s.ticket_status_id = t.current_status_id
      JOIN ticket_priorities p ON p.ticket_priority_id = t.ticket_priority_id
      LEFT JOIN LATERAL (SELECT assignment_id, assignee_id FROM ticket_assignments
        WHERE ticket_id=t.id AND (ended_at IS NULL OR s.code='CLOSED')
        ORDER BY assigned_at DESC LIMIT 1) a ON true
      ${filter}
    )
    SELECT dates.day::text AS date, count(v.id)::int AS value
    FROM dates LEFT JOIN visible v ON
      (v.created_at AT TIME ZONE ${timeZone})::date = dates.day AND v.created_at <= ${now}::timestamptz
    GROUP BY dates.day ORDER BY dates.day
  `);
}

async function trend(req, res, next) {
  try {
    if (!isStaff(req.userRole, req.userRoles))
      throw forbidden("Only staff can read ticket trends");
    const dashboard = customerServiceClientConfig.dashboard;
    const days = Number(req.query.days ?? dashboard.defaultDays);
    if (!dashboard.dayRanges.includes(days))
      throw badRequest("Invalid trend range");
    const items = await readTicketTrend({
      role: effectiveStaffRole(req),
      userId: req.userId,
      days,
    });
    res.set("Cache-Control", "no-store");
    res.json({ items, days, timeZone: dashboard.timeZone });
  } catch (error) {
    next(error);
  }
}

module.exports = { trend, readTicketTrend };
