// Integration test against a real, disposable Postgres database (reloop_support).
// Skips cleanly when DATABASE_URL is unset/unreachable; set REQUIRE_INTEGRATION=1
// to turn that skip into a hard failure instead.
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";
if (process.env.DATABASE_URL_SUPPORT) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_SUPPORT;
}

const { signAccessToken } = require("@reloop/shared");
const prisma = require("../src/models/prismaClient");
const app = require("../src/app");
// This feature suite uses signed identity fixtures; live session enforcement
// is covered separately by account-suspension.integration.test.js.
app.locals.validateAccessSession = async () => {};

async function databaseIsReachable() {
  if (!process.env.DATABASE_URL) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

test("executive tickets list against a real database", async (t) => {
  if (!(await databaseIsReachable())) {
    const message =
      "DATABASE_URL not set or database unreachable — set it to a disposable test database";
    if (process.env.REQUIRE_INTEGRATION === "1") {
      throw new Error(`REQUIRE_INTEGRATION=1 but ${message}`);
    }
    t.skip(message);
    return;
  }

  const runId = Date.now();
  const executiveToken = signAccessToken({
    sub: "int-test-executive",
    role: "EXECUTIVE",
    displayName: "Trusted Integration Executive",
  });
  const buyerToken = signAccessToken({
    sub: `buyer-${runId}`,
    role: "BUYER",
    displayName: "Trusted Integration Buyer",
  });

  const lookup = async (model, code) =>
    (await prisma[model].findUniqueOrThrow({ where: { code } })).id;

  // 2001 is far from any real data. Bangkok is UTC+7, so the Bangkok day of
  // 10 May 2001 runs from 2001-05-09T17:00Z.
  const rows = [
    ["A", "2001-05-10T05:00:00.000Z", "NEW", "ORDER", "HIGH"],
    ["B", "2001-05-10T08:00:00.000Z", "IN_PROGRESS", "PAYMENT", "NORMAL"],
    ["C", "2001-05-11T05:00:00.000Z", "CLOSED", "ORDER", "URGENT"],
    ["D", "2001-04-01T05:00:00.000Z", "NEW", "OTHER", "LOW"],
  ];
  const ids = [];

  try {
    for (const [key, at, status, category, priority] of rows) {
      const ticket = await prisma.supportTicket.create({
        data: {
          requesterId: `mock-exec-tickets-${runId}`,
          subject: `exec ticket ${key} ${runId}`,
          categoryId: await lookup("ticketCategory", category),
          priorityId: await lookup("ticketPriority", priority),
          currentStatusId: await lookup("ticketStatus", status),
          createdAt: new Date(at),
        },
      });
      ids.push(ticket.id);
    }

    const get = (query) =>
      request(app)
        .get("/executive/tickets")
        .query({ timezone: "Asia/Bangkok", ...query })
        .set("Authorization", `Bearer ${executiveToken}`);
    // Only this run's tickets: the range sits in 2001, where nothing else is.
    const keys = (res) => res.body.items.map((i) => i.subject.split(" ")[2]);

    // One Bangkok day: A and B, newest first. C is the next day, D a month before.
    const day = await get({ from: "2001-05-10", to: "2001-05-11" });
    assert.equal(day.status, 200);
    assert.deepEqual(keys(day), ["B", "A"]);
    assert.equal(day.body.total, 2);
    assert.equal(day.body.statusCounts.NEW, 1);
    assert.equal(day.body.statusCounts.IN_PROGRESS, 1);
    assert.equal(day.body.statusCounts.CLOSED, 0);
    assert.equal(day.body.meta.timezone, "Asia/Bangkok");

    // The filters offer what the reference tables hold.
    const { options } = day.body;
    assert.ok(options.statuses.some((s) => s.code === "ESCALATED"));
    assert.deepEqual(options.categories.map((c) => c.code).slice(0, 5), [
      "ORDER",
      "PAYMENT",
      "ACCOUNT",
      "TECHNICAL",
      "OTHER",
    ]);
    assert.deepEqual(options.priorities.map((p) => p.code).slice(0, 4), [
      "LOW",
      "NORMAL",
      "HIGH",
      "URGENT",
    ]);

    // Only what the page shows comes back.
    assert.deepEqual(Object.keys(day.body.items[1]).sort(), [
      "category",
      "createdAt",
      "id",
      "orderId",
      "priority",
      "status",
      "subject",
      "ticketNumber",
    ]);
    assert.deepEqual(day.body.items[1].category, {
      code: "ORDER",
      name: "คำสั่งซื้อ",
    });
    assert.equal(day.body.items[1].createdAt, "2001-05-10T05:00:00.000Z");

    // A wider range, then each filter on its own.
    const range = { from: "2001-05-10", to: "2001-05-12" };
    assert.deepEqual(keys(await get(range)), ["C", "B", "A"]);
    assert.deepEqual(keys(await get({ ...range, status: "CLOSED" })), ["C"]);
    assert.deepEqual(keys(await get({ ...range, category: "ORDER" })), [
      "C",
      "A",
    ]);
    assert.deepEqual(keys(await get({ ...range, priority: "NORMAL" })), ["B"]);
    // Filters combine; the status counts ignore only the status filter.
    const combined = await get({ ...range, category: "ORDER", status: "NEW" });
    assert.deepEqual(keys(combined), ["A"]);
    assert.equal(combined.body.statusCounts.NEW, 1);
    assert.equal(combined.body.statusCounts.CLOSED, 1);

    // Paging.
    const page = await get({ ...range, limit: 2, page: 2 });
    assert.deepEqual(keys(page), ["A"]);
    assert.equal(page.body.total, 3);
    assert.equal(page.body.totalPages, 2);

    // A value the page does not offer is refused, not matched against nothing.
    for (const bad of [
      { status: "DONE" },
      { category: "ANYTHING" },
      { priority: "MEH" },
    ]) {
      assert.equal((await get({ ...range, ...bad })).status, 400);
    }

    const forbidden = await request(app)
      .get("/executive/tickets")
      .set("Authorization", `Bearer ${buyerToken}`);
    assert.equal(forbidden.status, 403);
    assert.equal((await request(app).get("/executive/tickets")).status, 401);
  } finally {
    await prisma.supportTicket.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  }
});
