const {
  customerServiceClientConfig: { dashboard },
  customerServicePolicy,
} = require("./customerServiceConfig");
const { badRequest, forbidden } = require("./errors");

const PAGE_SIZE = dashboard.pageSize;
const WARNING_MINUTES = dashboard.warningMinutes;
const FOCUSES = [
  "all",
  "overdue",
  "soon",
  "unassigned",
  "mine",
  "waiting",
  "mine_overdue",
  "mine_soon",
  "mine_safe",
  "mine_no_deadline",
];

function dashboardOptions(req) {
  const roles = [
    req.userRole,
    ...(Array.isArray(req.userRoles) ? req.userRoles : []),
  ];
  if (!req.userId || !roles.includes("CUSTOMER_SERVICE")) {
    throw forbidden("This dashboard is for Customer Service agents");
  }
  const focus = req.query.focus ?? "all";
  const pageText = String(req.query.page ?? "1");
  const days = Number(req.query.days ?? dashboard.defaultDays);
  const priority = req.query.priority ?? "";
  if (
    !FOCUSES.includes(focus) ||
    !/^[1-9]\d{0,5}$/.test(pageText) ||
    !dashboard.dayRanges.includes(days) ||
    (priority !== "" &&
      ![...Object.keys(customerServicePolicy.priorities), "CRITICAL"].includes(
        priority,
      ))
  ) {
    throw badRequest("Invalid dashboard filter or page");
  }
  return {
    userId: req.userId,
    focus,
    page: Number(pageText),
    days,
    ...(priority ? { priority } : {}),
  };
}

// Each service supplies only rows the agent can work on. One SQL statement
// keeps counts, distributions and the paginated action list on one snapshot.
async function readAgentDashboard(
  db,
  Prisma,
  base,
  options,
  now = new Date(),
  activity = null,
) {
  const { userId, focus, page } = options;
  const days = options.days ?? dashboard.defaultDays;
  const priorityRanks = Prisma.join(
    Object.entries(customerServicePolicy.priorities).map(
      ([code, policy]) => Prisma.sql`WHEN ${code} THEN ${policy.rank}`,
    ),
    " ",
  );
  const activityBase =
    activity ||
    Prisma.sql`SELECT NULL::text AS id, NULL::text AS kind, NULL::timestamptz AS happened_at WHERE FALSE`;
  const filters = {
    all: Prisma.sql`TRUE`,
    overdue: Prisma.sql`due_at <= ${now}::timestamptz`,
    soon: Prisma.sql`due_at > ${now}::timestamptz AND due_at <= ${now}::timestamptz + ${WARNING_MINUTES}::int * interval '1 minute'`,
    unassigned: Prisma.sql`assignee_id IS NULL`,
    mine: Prisma.sql`assignee_id = ${userId}`,
    mine_overdue: Prisma.sql`assignee_id = ${userId} AND due_at <= ${now}::timestamptz`,
    mine_soon: Prisma.sql`assignee_id = ${userId} AND due_at > ${now}::timestamptz AND due_at <= ${now}::timestamptz + ${WARNING_MINUTES}::int * interval '1 minute'`,
    mine_safe: Prisma.sql`assignee_id = ${userId} AND due_at > ${now}::timestamptz + ${WARNING_MINUTES}::int * interval '1 minute'`,
    mine_no_deadline: Prisma.sql`assignee_id = ${userId} AND due_at IS NULL`,
    waiting: Prisma.sql`status IN ('PENDING_USER', 'NEEDS_INFO')`,
  };
  const [row] = await db.$queryRaw(Prisma.sql`
    WITH cases AS (${base}),
    my_cases AS (SELECT * FROM cases WHERE assignee_id = ${userId}),
    activity_events AS (${activityBase}),
    dates AS (
      SELECT ((${now}::timestamptz AT TIME ZONE ${dashboard.timeZone})::date - (${days}::int - 1) + n) AS day
      FROM generate_series(0, ${days}::int - 1) n
    ),
    daily AS (
      SELECT (happened_at AT TIME ZONE ${dashboard.timeZone})::date AS day,
        count(DISTINCT id) FILTER (WHERE kind = 'RECEIVED')::int AS received,
        count(DISTINCT id) FILTER (WHERE kind = 'COMPLETED')::int AS completed
      FROM activity_events WHERE happened_at <= ${now}::timestamptz
        AND happened_at >= ((SELECT min(day) FROM dates)::timestamp AT TIME ZONE ${dashboard.timeZone})
      GROUP BY 1
    ),
    matching AS (SELECT * FROM cases WHERE ${filters[focus]} AND ${options.priority ? Prisma.sql`priority = ${options.priority}` : Prisma.sql`TRUE`}),
    page_rows AS (
      SELECT * FROM matching
      ORDER BY due_at ASC NULLS LAST, priority_score DESC, created_at ASC, id ASC
      LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}
    )
    SELECT jsonb_build_object(
      'asOf', ${now}::timestamptz,
      'warningMinutes', ${WARNING_MINUTES}::int,
      'timeZone', ${dashboard.timeZone}::text,
      'days', ${days}::int,
      'trend', (SELECT jsonb_agg(jsonb_build_object('date', dates.day,
        'received', COALESCE(daily.received, 0), 'completed', COALESCE(daily.completed, 0)) ORDER BY dates.day)
        FROM dates LEFT JOIN daily ON daily.day = dates.day),
      'priorities', COALESCE((SELECT jsonb_agg(jsonb_build_object('label', priority, 'value', total) ORDER BY rank DESC, priority ASC)
        FROM (SELECT priority, count(*)::int AS total,
          max(CASE priority WHEN 'CRITICAL' THEN ${customerServicePolicy.priorities.URGENT.rank} ${priorityRanks} ELSE 0 END) AS rank
          FROM cases GROUP BY priority) p), '[]'::jsonb),
      'counts', (SELECT jsonb_build_object(
        'all', count(*)::int,
        'overdue', count(*) FILTER (WHERE due_at <= ${now}::timestamptz)::int,
        'soon', count(*) FILTER (WHERE due_at > ${now}::timestamptz AND due_at <= ${now}::timestamptz + ${WARNING_MINUTES}::int * interval '1 minute')::int,
        'unassigned', count(*) FILTER (WHERE assignee_id IS NULL)::int,
        'mine', count(*) FILTER (WHERE assignee_id = ${userId})::int,
        'waiting', count(*) FILTER (WHERE status IN ('PENDING_USER', 'NEEDS_INFO'))::int
      ) FROM cases),
      'personal', jsonb_build_object(
        'awaitingReply', ${Array.isArray(options.replyIds) ? Prisma.sql`(SELECT count(*)::int FROM my_cases WHERE id IN (${options.replyIds.length ? Prisma.join(options.replyIds) : Prisma.sql`NULL`}))` : Prisma.sql`NULL`},
        'counts', (SELECT jsonb_build_object(
          'all', count(*)::int,
          'overdue', count(*) FILTER (WHERE due_at <= ${now}::timestamptz)::int,
          'soon', count(*) FILTER (WHERE due_at > ${now}::timestamptz AND due_at <= ${now}::timestamptz + ${WARNING_MINUTES}::int * interval '1 minute')::int,
          'waiting', count(*) FILTER (WHERE status IN ('PENDING_USER', 'NEEDS_INFO'))::int
        ) FROM my_cases),
        'priorities', COALESCE((SELECT jsonb_agg(jsonb_build_object('label', priority, 'value', total) ORDER BY priority)
          FROM (SELECT priority, count(*)::int AS total FROM my_cases GROUP BY priority) p), '[]'::jsonb),
        'withoutDeadline', (SELECT count(*)::int FROM my_cases WHERE due_at IS NULL),
        'workflow', (SELECT jsonb_build_array(
          jsonb_build_object('label', 'ACCEPTED', 'value', count(*) FILTER (WHERE status NOT IN ('PENDING_USER', 'NEEDS_INFO'))),
          jsonb_build_object('label', 'WAITING_INFO', 'value', count(*) FILTER (WHERE status IN ('PENDING_USER', 'NEEDS_INFO')))
        ) FROM my_cases),
        'aging', (SELECT jsonb_build_array(
          jsonb_build_object('label', ${`น้อยกว่า ${dashboard.agingHours[0]} ชม.`}::text, 'value', count(*) FILTER (WHERE created_at > ${now}::timestamptz - ${dashboard.agingHours[0]}::int * interval '1 hour')),
          jsonb_build_object('label', ${`${dashboard.agingHours[0]}–${dashboard.agingHours[1]} ชม.`}::text, 'value', count(*) FILTER (WHERE created_at <= ${now}::timestamptz - ${dashboard.agingHours[0]}::int * interval '1 hour' AND created_at > ${now}::timestamptz - ${dashboard.agingHours[1]}::int * interval '1 hour')),
          jsonb_build_object('label', ${`${dashboard.agingHours[1]} ชม. ขึ้นไป`}::text, 'value', count(*) FILTER (WHERE created_at <= ${now}::timestamptz - ${dashboard.agingHours[1]}::int * interval '1 hour'))
        ) FROM my_cases)
      ),
      'statuses', COALESCE((SELECT jsonb_agg(jsonb_build_object('label', status, 'value', total) ORDER BY status)
        FROM (SELECT status, count(*)::int AS total FROM cases GROUP BY status) s), '[]'::jsonb),
      'workflow', (SELECT jsonb_build_array(
        jsonb_build_object('label', 'UNASSIGNED', 'value', count(*) FILTER (WHERE assignee_id IS NULL AND status NOT IN ('PENDING_USER', 'NEEDS_INFO'))),
        jsonb_build_object('label', 'ACCEPTED', 'value', count(*) FILTER (WHERE assignee_id IS NOT NULL AND status NOT IN ('PENDING_USER', 'NEEDS_INFO'))),
        jsonb_build_object('label', 'WAITING_INFO', 'value', count(*) FILTER (WHERE status IN ('PENDING_USER', 'NEEDS_INFO')))
      ) FROM cases),
      'aging', (SELECT jsonb_build_array(
        jsonb_build_object('label', ${`น้อยกว่า ${dashboard.agingHours[0]} ชม.`}::text, 'value', count(*) FILTER (WHERE created_at > ${now}::timestamptz - ${dashboard.agingHours[0]}::int * interval '1 hour')),
        jsonb_build_object('label', ${`${dashboard.agingHours[0]}–${dashboard.agingHours[1]} ชม.`}::text, 'value', count(*) FILTER (WHERE created_at <= ${now}::timestamptz - ${dashboard.agingHours[0]}::int * interval '1 hour' AND created_at > ${now}::timestamptz - ${dashboard.agingHours[1]}::int * interval '1 hour')),
        jsonb_build_object('label', ${`${dashboard.agingHours[1]} ชม. ขึ้นไป`}::text, 'value', count(*) FILTER (WHERE created_at <= ${now}::timestamptz - ${dashboard.agingHours[1]}::int * interval '1 hour'))
      ) FROM cases),
      'total', (SELECT count(*)::int FROM matching),
      'page', ${page}::int, 'pageSize', ${PAGE_SIZE}::int,
      'items', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'reference', reference, 'subject', subject, 'status', status,
        'priority', priority, 'assigneeId', assignee_id, 'dueAt', due_at, 'createdAt', created_at
      ) ORDER BY due_at ASC NULLS LAST, priority_score DESC, created_at ASC, id ASC) FROM page_rows), '[]'::jsonb)
    ) AS dashboard
  `);
  return row.dashboard;
}

module.exports = { dashboardOptions, readAgentDashboard };
