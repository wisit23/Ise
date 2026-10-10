const test = require("node:test");
const assert = require("node:assert/strict");
const { PrismaClient } = require("../src/generated/prisma-client");
const { readTicketTrend } = require("../src/features/tickets/ticketTrend");

test("PostgreSQL trend counts beyond 50, fills empty dates, and keeps CS ownership filtering", async (t) => {
  const url = process.env.DATABASE_URL_DASHBOARD;
  if (!url || !new URL(url).pathname.startsWith("/reloop_ui_")) {
    if (process.env.REQUIRE_INTEGRATION === "1")
      throw new Error("Requires disposable DATABASE_URL_DASHBOARD");
    t.skip("Set disposable DATABASE_URL_DASHBOARD");
    return;
  }
  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    await db.$transaction(async (tx) => {
      for (const sql of [
        "CREATE TEMP TABLE support_tickets (id text, created_at timestamptz, current_status_id int, ticket_priority_id int) ON COMMIT DROP",
        "CREATE TEMP TABLE ticket_statuses (ticket_status_id int, code text) ON COMMIT DROP",
        "CREATE TEMP TABLE ticket_priorities (ticket_priority_id int, code text) ON COMMIT DROP",
        "CREATE TEMP TABLE ticket_assignments (assignment_id text, ticket_id text, assignee_id text, assigned_at timestamptz, ended_at timestamptz) ON COMMIT DROP",
        "INSERT INTO ticket_statuses VALUES (1,'NEW'),(2,'ESCALATED')",
        "INSERT INTO ticket_priorities VALUES (1,'NORMAL')",
        "INSERT INTO support_tickets SELECT n::text, '2026-10-08T20:00:00Z'::timestamptz, 1, 1 FROM generate_series(1,75) n",
        "INSERT INTO support_tickets VALUES ('private','2026-10-08T20:00:00Z',1,1), ('escalated','2026-10-08T20:00:00Z',2,1)",
        "INSERT INTO ticket_assignments VALUES ('a','private','other','2026-10-08T20:00:00Z',NULL)",
      ])
        await tx.$executeRawUnsafe(sql);
      const now = new Date("2026-10-09T05:00:00Z");
      const cs = await readTicketTrend(
        { role: "CUSTOMER_SERVICE", userId: "agent", days: 7 },
        tx,
        now,
      );
      assert.equal(cs.length, 7);
      assert.equal(cs[6].date, "2026-10-09");
      assert.equal(cs[6].value, 75);
      assert.equal(cs[5].value, 0);
      const admin = await readTicketTrend(
        { role: "ADMIN", userId: "admin", days: 7 },
        tx,
        now,
      );
      assert.equal(admin[6].value, 77);
    });
  } finally {
    await db.$disconnect();
  }
});
