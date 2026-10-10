const test = require("node:test");
const assert = require("node:assert/strict");
const { readAgentDashboard } = require("./agentDashboard");
const {
  PrismaClient,
  Prisma,
} = require("../../services/support-service/src/generated/prisma-client");
const {
  Prisma: OrderPrisma,
} = require("../../services/order-service/src/generated/prisma-client");
const {
  ticketDashboardBase,
  ticketActivityBase,
} = require("../../services/support-service/src/features/tickets/agentDashboard");
const {
  disputeDashboardBase,
  disputeActivityBase,
} = require("../../services/order-service/src/features/disputes/agentDashboard");

test("dashboard PostgreSQL snapshot: all-row totals, SLA boundaries, ownership, terminal cases and pagination", async (t) => {
  if (!process.env.DATABASE_URL_DASHBOARD) {
    if (process.env.REQUIRE_INTEGRATION === "1")
      throw new Error("DATABASE_URL_DASHBOARD required");
    t.skip("Set DATABASE_URL_DASHBOARD to a disposable PostgreSQL database");
    return;
  }
  const db = new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_URL_DASHBOARD } },
  });
  t.after(() => db.$disconnect());
  const now = new Date("2026-10-09T05:00:00Z");
  const options = { userId: "agent-a", focus: "all", page: 1 };
  await db.$transaction(
    async (tx) => {
      // Session-local tables shadow real ones; nothing persists or touches real cases.
      for (const ddl of [
        "CREATE TEMP TABLE support_tickets (id text, ticket_number text, subject text, current_status_id int, ticket_priority_id int, priority_score int, created_at timestamptz) ON COMMIT DROP",
        "CREATE TEMP TABLE ticket_statuses (ticket_status_id int, code text) ON COMMIT DROP",
        "CREATE TEMP TABLE ticket_priorities (ticket_priority_id int, code text) ON COMMIT DROP",
        "CREATE TEMP TABLE ticket_assignments (ticket_id text, assignee_id text, ended_at timestamptz, assigned_at timestamptz DEFAULT now()) ON COMMIT DROP",
        "CREATE TEMP TABLE ticket_sla_targets (ticket_id text, due_at timestamptz, achieved_at timestamptz) ON COMMIT DROP",
        "CREATE TEMP TABLE dispute_cases (id text, order_id text, reason text, status text, priority text, priority_score int, created_at timestamp, assigned_to text, assigned_role text, sla_expires_at timestamp) ON COMMIT DROP",
        "CREATE TEMP TABLE ticket_status_history (ticket_id text, to_status_id int, changed_by_id text, created_at timestamptz) ON COMMIT DROP",
        "CREATE TEMP TABLE dispute_audit_logs (dispute_id text, actor_id text, action text, created_at timestamp) ON COMMIT DROP",
      ])
        await tx.$executeRawUnsafe(ddl);
      await tx.$executeRaw`INSERT INTO ticket_statuses VALUES (1,'NEW'),(2,'ASSIGNED'),(3,'PENDING_USER'),(4,'RESOLVED'),(5,'CLOSED'),(6,'ESCALATED'),(7,'IN_PROGRESS')`;
      await tx.$executeRaw`INSERT INTO ticket_priorities VALUES (1,'NORMAL')`;
      await tx.$executeRaw`INSERT INTO support_tickets
      SELECT 't-' || n, 'CS-' || n, 'Example', 1, 1, 0, ${now}::timestamptz - interval '24 hours'
      FROM generate_series(1,60) n`;
      await tx.$executeRaw`UPDATE support_tickets SET current_status_id=CASE id WHEN 't-1' THEN 4 WHEN 't-2' THEN 5 WHEN 't-3' THEN 6 WHEN 't-4' THEN 2 WHEN 't-6' THEN 3 ELSE 1 END`;
      await tx.$executeRaw`INSERT INTO ticket_assignments (ticket_id, assignee_id, ended_at) VALUES ('t-4','agent-b',NULL),('t-5','agent-a',NULL),('t-6','agent-a',NULL),('t-7','agent-b',${now})`;
      await tx.$executeRaw`INSERT INTO ticket_sla_targets VALUES
      ('t-5',${now},NULL), ('t-5',${now}::timestamptz + interval '30 minutes',NULL),
      ('t-6',${now}::timestamptz + interval '60 minutes',NULL),
      ('t-7',${now}::timestamptz + interval '60 minutes 1 second',NULL),
      ('t-8',${now}::timestamptz - interval '1 hour',${now})`;
      await tx.$executeRaw`UPDATE ticket_assignments SET assigned_at = ${now}::timestamptz - interval '2 hours'`;
      await tx.$executeRaw`INSERT INTO ticket_status_history VALUES
        ('t-1',4,'agent-a','2026-10-08T17:00:00Z'),
        ('t-1',4,'agent-a','2026-10-09T03:00:00Z'),
        ('t-2',4,'agent-b','2026-10-09T03:00:00Z'),
        ('t-3',4,'agent-a','2026-09-01T03:00:00Z'),
        ('t-4',4,'agent-a','2026-10-09T06:00:00Z')`;
      const read = (changes = {}) =>
        readAgentDashboard(
          tx,
          Prisma,
          ticketDashboardBase("agent-a"),
          { ...options, ...changes },
          now,
          ticketActivityBase("agent-a"),
        );
      const all = await read();
      assert.equal(all.trend.length, 14);
      assert.deepEqual(all.trend.at(-1), {
        date: "2026-10-09",
        received: 2,
        completed: 1,
      });
      assert.equal(
        all.trend.reduce((sum, row) => sum + row.completed, 0),
        1,
        "deduplicates per day; excludes future, old and other staff events",
      );
      assert.equal((await read({ days: 7 })).trend.length, 7);

      assert.equal(
        all.counts.all,
        56,
        "counts all rows, not just the first 50",
      );
      assert.deepEqual(all.counts, {
        all: 56,
        overdue: 1,
        soon: 1,
        unassigned: 54,
        mine: 2,
        waiting: 1,
      });
      assert.equal(all.items.length, 8);
      assert.deepEqual(all.personal.priorities, [
        { label: "NORMAL", value: 2 },
      ]);
      assert.deepEqual(all.personal.counts, {
        all: 2,
        overdue: 1,
        soon: 1,
        waiting: 1,
      });
      assert.deepEqual(all.personal.workflow, [
        { label: "ACCEPTED", value: 1 },
        { label: "WAITING_INFO", value: 1 },
      ]);
      assert.equal(
        all.personal.aging[1].value,
        2,
        "personal charts exclude the 54 unassigned cases",
      );
      assert.equal((await read({ focus: "mine_overdue" })).total, 1);
      assert.equal((await read({ focus: "mine_soon" })).total, 1);
      assert.equal((await read({ focus: "mine", priority: "HIGH" })).total, 0);
      assert.equal(
        (await read({ focus: "mine", priority: "NORMAL" })).total,
        2,
      );
      assert.deepEqual(all.workflow, [
        { label: "UNASSIGNED", value: 54 },
        { label: "ACCEPTED", value: 1 },
        { label: "WAITING_INFO", value: 1 },
      ]);
      assert.equal(all.items[0].id, "t-5", "two SLA targets count as one case");
      assert.equal(all.aging[1].value, 56, "24h boundary belongs to 24–72h");
      assert.equal((await read({ focus: "soon" })).items[0].id, "t-6");
      assert.equal((await read({ focus: "waiting" })).total, 1);
      const second = await read({ page: 2 });
      assert.equal(second.total, 56);
      assert.ok(
        second.items.every(
          (row) => !all.items.some((first) => first.id === row.id),
        ),
      );
      assert.equal((await read({ page: 9 })).items.length, 0);
      await tx.$executeRaw`INSERT INTO ticket_assignments (ticket_id,assignee_id,ended_at) VALUES ('t-7','agent-a',NULL),('t-8','agent-a',NULL)`;
      const fourBuckets = await read({ focus: "mine" });
      assert.equal(fourBuckets.personal.counts.all, 4);
      assert.equal(
        fourBuckets.personal.withoutDeadline,
        1,
        "completed SLA targets are not treated as future deadlines",
      );
      assert.equal(fourBuckets.personal.counts.overdue, 1);
      assert.equal(fourBuckets.personal.counts.soon, 1);
      assert.equal(
        (await read({ focus: "mine_safe" })).items[0].id,
        "t-7",
        "60 minutes plus one second is still time remaining",
      );
      assert.equal(
        (await read({ focus: "mine_no_deadline" })).items[0].id,
        "t-8",
      );
      await tx.$executeRaw`INSERT INTO dispute_cases VALUES
      ('d-1','o-1','Reason','OPEN','NORMAL',0,'2026-10-06 05:00:00','agent-a','CUSTOMER_SERVICE','2026-10-09 05:00:00'),
      ('d-2','o-2','Reason','NEEDS_INFO','NORMAL',0,'2026-10-09 04:00:00',NULL,NULL,NULL),
      ('d-3','o-3','Reason','OPEN','NORMAL',0,'2026-10-09',NULL,'ADMIN',NULL),
      ('d-4','o-4','Reason','OPEN','NORMAL',0,'2026-10-09',NULL,'TRUST_AND_SAFETY',NULL),
      ('d-5','o-5','Reason','DECIDED','NORMAL',0,'2026-10-09','agent-a','CUSTOMER_SERVICE',NULL),
      ('d-6','o-6','Reason','OPEN','NORMAL',0,'2026-10-09','agent-b','CUSTOMER_SERVICE',NULL)`;
      await tx.$executeRaw`INSERT INTO dispute_audit_logs VALUES
        ('d-1','agent-a','CLAIM','2026-10-09 03:00:00'),
        ('d-1','agent-a','ESCALATE','2026-10-09 04:00:00'),
        ('d-1','agent-a','ESCALATE','2026-10-09 04:01:00'),
        ('d-3','agent-b','CLAIM','2026-10-09 03:00:00')`;
      const disputes = await readAgentDashboard(
        tx,
        OrderPrisma,
        disputeDashboardBase("agent-a"),
        options,
        now,
        disputeActivityBase("agent-a"),
      );
      assert.deepEqual(
        disputes.workflow,
        [
          { label: "UNASSIGNED", value: 0 },
          { label: "ACCEPTED", value: 1 },
          { label: "WAITING_INFO", value: 1 },
        ],
        "waiting for information takes precedence over missing ownership; groups never overlap",
      );
      assert.deepEqual(disputes.trend.at(-1), {
        date: "2026-10-09",
        received: 1,
        completed: 1,
      });
      assert.deepEqual(disputes.counts, {
        all: 2,
        overdue: 1,
        soon: 0,
        mine: 1,
        unassigned: 1,
        waiting: 1,
      });
      assert.equal(disputes.aging[2].value, 1);
      assert.equal(
        new Date(disputes.items[0].dueAt).toISOString(),
        now.toISOString(),
      );
      const empty = await readAgentDashboard(
        tx,
        OrderPrisma,
        disputeDashboardBase("nobody"),
        { ...options, userId: "nobody", focus: "mine" },
        now,
      );
      assert.equal(empty.total, 0);
      assert.deepEqual(empty.items, []);
    },
    { timeout: 20000 },
  );
});
