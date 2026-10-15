const { badRequest, forbidden } = require("./errors");

const RETENTION_VIEWS = ["active", "archived", "deleted", "all"];

function retentionView(value = "active", role) {
  if (!RETENTION_VIEWS.includes(value))
    throw badRequest("invalid retention filter");
  if (
    ["deleted", "all"].includes(value) &&
    !["ADMIN", "TRUST_AND_SAFETY"].includes(role)
  )
    throw forbidden("only safety staff can inspect deleted cases");
  return value;
}

function retentionWhere(view = "active") {
  if (view === "all") return {};
  if (view === "deleted") return { deletedAt: { not: null } };
  return {
    deletedAt: null,
    archivedAt: view === "archived" ? { not: null } : null,
  };
}

// Neither sweep removes case rows, conversations, attachments or audit evidence.
// Database timestamps and terminal-state guards make retries and concurrent
// service replicas safe. A bounded batch keeps normal case writes responsive.
async function sweepCaseRetention(db, Prisma, domain, now = new Date()) {
  const ticket = domain === "tickets";
  if (!ticket && domain !== "disputes")
    throw new Error("Unknown retention domain");
  const table = Prisma.raw(ticket ? "support_tickets" : "dispute_case");
  const id = Prisma.raw(ticket ? "ticket_id" : "dispute_case_id");
  const closed = Prisma.raw(ticket ? "closed_at" : "decided_at");
  const years = ticket ? 1 : 5;
  const terminal = ticket
    ? Prisma.sql`current_status_id IN (SELECT ticket_status_id FROM ticket_statuses WHERE code = 'CLOSED')`
    : Prisma.sql`status = 'DECIDED'`;
  const stamp = ticket
    ? Prisma.sql`${now}::timestamptz`
    : Prisma.sql`${now}::timestamptz AT TIME ZONE 'UTC'`;
  const archived = await db.$executeRaw(Prisma.sql`
    UPDATE ${table} SET archived_at = ${closed} + interval '90 days',
      retention_until = ${closed} + ${years}::int * interval '1 year'
    WHERE ${id} IN (SELECT ${id} FROM ${table} WHERE ${terminal}
      AND archived_at IS NULL AND deleted_at IS NULL
      AND ${closed} <= ${stamp} - interval '90 days'
      ORDER BY ${closed}, ${id} LIMIT 200)
      AND archived_at IS NULL AND deleted_at IS NULL AND ${terminal}
  `);
  const deleted = await db.$executeRaw(Prisma.sql`
    UPDATE ${table} SET deleted_at = retention_until
    WHERE ${id} IN (SELECT ${id} FROM ${table} WHERE ${terminal}
      AND archived_at IS NOT NULL AND deleted_at IS NULL AND retention_until <= ${stamp}
      ORDER BY retention_until, ${id} LIMIT 200)
      AND deleted_at IS NULL AND ${terminal}
  `);
  return { archived, deleted };
}

function startCaseRetention(db, Prisma, domain) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await sweepCaseRetention(db, Prisma, domain);
    } catch (err) {
      console.error(`[${domain}] retention sweep failed: ${err.message}`);
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(tick, 60000);
  timer.unref();
  return () => clearInterval(timer);
}

module.exports = {
  retentionView,
  retentionWhere,
  sweepCaseRetention,
  startCaseRetention,
};
