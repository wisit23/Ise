const test = require("node:test");
const assert = require("node:assert/strict");
const {
  PrismaClient,
  Prisma,
} = require("../../services/support-service/src/generated/prisma-client");
const { sweepCaseRetention } = require("./caseRetention");
const { readAgentDashboard } = require("./agentDashboard");

function testDatabase(t) {
  const raw = process.env.DATABASE_URL_DASHBOARD;
  if (!raw) {
    if (process.env.REQUIRE_INTEGRATION === "1")
      throw new Error("Disposable DATABASE_URL_DASHBOARD required");
    t.skip("Set disposable DATABASE_URL_DASHBOARD");
    return null;
  }
  const url = new URL(raw);
  assert.ok(
    ["127.0.0.1", "localhost"].includes(url.hostname) &&
      /^\/reloop_ci_[a-z0-9_]+$/.test(url.pathname),
  );
  const db = new PrismaClient({ datasources: { db: { url: raw } } });
  t.after(() => db.$disconnect());
  return db;
}

test("PostgreSQL retention uses closure, exact 90-day/1-year/5-year boundaries and idempotent soft delete", async (t) => {
  const db = testDatabase(t);
  if (!db) return;
  const now = new Date("2026-10-15T12:00:00Z");
  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      "CREATE TEMP TABLE ticket_statuses (ticket_status_id int, code text) ON COMMIT DROP",
    );
    await tx.$executeRawUnsafe(
      "CREATE TEMP TABLE support_tickets (ticket_id text PRIMARY KEY, current_status_id int, closed_at timestamptz, archived_at timestamptz, deleted_at timestamptz, retention_until timestamptz) ON COMMIT DROP",
    );
    await tx.$executeRawUnsafe(
      "CREATE TEMP TABLE dispute_case (dispute_case_id text PRIMARY KEY, status text, decided_at timestamp, archived_at timestamp, deleted_at timestamp, retention_until timestamp) ON COMMIT DROP",
    );
    await tx.$executeRaw`INSERT INTO ticket_statuses VALUES (1,'CLOSED'), (2,'NEW')`;
    await tx.$executeRaw`INSERT INTO support_tickets (ticket_id,current_status_id,closed_at) VALUES
      ('ninety',1,${now}::timestamptz - interval '90 days'),
      ('recent',1,${now}::timestamptz - interval '90 days' + interval '1 millisecond'),
      ('expired',1,${now}::timestamptz - interval '1 year'),
      ('before-expiry',1,${now}::timestamptz - interval '1 year' + interval '1 millisecond'),
      ('open',2,${now}::timestamptz - interval '2 years'), ('unknown',1,NULL)`;
    assert.deepEqual(await sweepCaseRetention(tx, Prisma, "tickets", now), {
      archived: 3,
      deleted: 1,
    });
    assert.deepEqual(await sweepCaseRetention(tx, Prisma, "tickets", now), {
      archived: 0,
      deleted: 0,
    });
    const tickets =
      await tx.$queryRaw`SELECT * FROM support_tickets ORDER BY ticket_id`;
    assert.equal(tickets.length, 6, "soft delete preserves the row");
    assert.equal(
      tickets.find((row) => row.ticket_id === "recent").archived_at,
      null,
    );
    assert.equal(
      tickets.find((row) => row.ticket_id === "before-expiry").deleted_at,
      null,
    );
    assert.equal(
      tickets.find((row) => row.ticket_id === "open").deleted_at,
      null,
    );
    assert.equal(
      tickets.find((row) => row.ticket_id === "unknown").archived_at,
      null,
    );
    assert.equal(
      tickets
        .find((row) => row.ticket_id === "expired")
        .deleted_at.toISOString(),
      now.toISOString(),
    );
    await tx.$executeRaw`INSERT INTO dispute_case (dispute_case_id,status,decided_at) VALUES
      ('ninety','DECIDED',(${now}::timestamptz AT TIME ZONE 'UTC') - interval '90 days'),
      ('expired','DECIDED',(${now}::timestamptz AT TIME ZONE 'UTC') - interval '5 years'),
      ('before-expiry','DECIDED',(${now}::timestamptz AT TIME ZONE 'UTC') - interval '5 years' + interval '1 millisecond'),
      ('open','OPEN',(${now}::timestamptz AT TIME ZONE 'UTC') - interval '6 years')`;
    assert.deepEqual(await sweepCaseRetention(tx, Prisma, "disputes", now), {
      archived: 3,
      deleted: 1,
    });
    assert.deepEqual(await sweepCaseRetention(tx, Prisma, "disputes", now), {
      archived: 0,
      deleted: 0,
    });
    const disputes = await tx.$queryRaw`SELECT * FROM dispute_case`;
    assert.equal(disputes.length, 4);
    assert.equal(
      disputes.find((row) => row.dispute_case_id === "before-expiry")
        .deleted_at,
      null,
    );
    assert.equal(
      disputes.find((row) => row.dispute_case_id === "open").archived_at,
      null,
    );
  });
});

test("today dashboard fills 24 Thai hours, excludes yesterday and future events", async (t) => {
  const db = testDatabase(t);
  if (!db) return;
  const now = new Date("2026-10-15T05:00:00Z");
  const empty = Prisma.sql`SELECT NULL::text AS id, NULL::text AS reference, NULL::text AS subject,
    NULL::text AS status, NULL::text AS priority, 0 AS priority_score, NULL::text AS assignee_id,
    NULL::timestamptz AS due_at, NULL::timestamptz AS created_at WHERE FALSE`;
  const activity = Prisma.sql`SELECT * FROM (VALUES
    ('a','RECEIVED','2026-10-14T17:00:00Z'::timestamptz),
    ('b','RECEIVED','2026-10-14T16:59:59.999Z'::timestamptz),
    ('c','RECEIVED','2026-10-15T04:59:59Z'::timestamptz),
    ('d','RECEIVED','2026-10-15T05:00:00.001Z'::timestamptz)
  ) AS events(id,kind,happened_at)`;
  const data = await readAgentDashboard(
    db,
    Prisma,
    empty,
    { userId: "cs", focus: "all", page: 1, days: 1 },
    now,
    activity,
  );
  assert.equal(data.trend.length, 24);
  assert.deepEqual(data.trend[0], {
    date: "2026-10-15T00:00:00",
    received: 1,
    completed: 0,
  });
  assert.equal(data.trend[11].received, 1);
  assert.equal(data.trend[12].received, 0);
  assert.equal(data.trend.at(-1).date, "2026-10-15T23:00:00");
  assert.equal(
    data.trend.reduce((sum, row) => sum + row.received, 0),
    2,
  );
});
