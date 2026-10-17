// Integration test against a real, disposable Postgres database (reloop_order).
// Skips cleanly when DATABASE_URL is unset/unreachable so `npm test` still
// passes on a machine with no database configured. Set REQUIRE_INTEGRATION=1
// (the CI workflow does) to turn that skip into a hard failure instead.
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";
if (process.env.DATABASE_URL_ORDER) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_ORDER;
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

test("executive disputes list against a real database", async (t) => {
  if (!(await databaseIsReachable())) {
    const message =
      "DATABASE_URL not set or database unreachable — set it to a disposable test database " +
      "(after running the order-service migrations against it) to run this test";
    if (process.env.REQUIRE_INTEGRATION === "1") {
      throw new Error(`REQUIRE_INTEGRATION=1 but ${message}`);
    }
    t.skip(message);
    return;
  }

  const runId = Date.now();
  const buyerId = `mock-exec-disputes-buyer-${runId}`;
  const executiveToken = signAccessToken({
    sub: "int-test-executive",
    role: "EXECUTIVE",
    displayName: "Trusted Integration Executive",
  });
  const buyerToken = signAccessToken({
    sub: buyerId,
    role: "BUYER",
    displayName: "Trusted Integration Buyer",
  });

  // 2001 is far from any real data. Bangkok is UTC+7, so the Bangkok day of
  // 10 May 2001 runs from 2001-05-09T17:00Z.
  const cases = [
    ["A", "2001-05-10T05:00:00.000Z", "OPEN", "DAMAGED_ITEM", "HIGH", null],
    [
      "B",
      "2001-05-10T08:00:00.000Z",
      "NEEDS_INFO",
      "WRONG_ITEM",
      "NORMAL",
      null,
    ],
    [
      "C",
      "2001-05-11T05:00:00.000Z",
      "DECIDED",
      "DAMAGED_ITEM",
      "URGENT",
      "REJECT",
    ],
    ["D", "2001-04-01T05:00:00.000Z", "OPEN", "OTHER", "LOW", null],
  ].map(([key, at, status, disputeType, priority, decision]) => ({
    key,
    orderId: `mock-exec-disputes-${runId}-${key}`,
    createdAt: new Date(at),
    status,
    disputeType,
    priority,
    decision,
  }));

  try {
    await prisma.order.createMany({
      data: cases.map((c) => ({
        id: c.orderId,
        buyerId,
        sellerId: "s1",
        productId: `p-${c.key}`,
        originalAmount: 100,
        ordersAmount: 100,
        orderType: "BUY_NOW",
        status: "disputed",
        createdAt: c.createdAt,
      })),
    });
    await prisma.disputeCase.createMany({
      data: cases.map((c) => ({
        id: `d-${c.orderId}`,
        orderId: c.orderId,
        createdBy: buyerId,
        reason: `reason ${c.key}`,
        disputeType: c.disputeType,
        status: c.status,
        priority: c.priority,
        decision: c.decision,
        createdAt: c.createdAt,
      })),
    });

    const get = (query) =>
      request(app)
        .get("/executive/disputes")
        .query({ timezone: "Asia/Bangkok", ...query })
        .set("Authorization", `Bearer ${executiveToken}`);
    const ids = (res) => res.body.items.map((i) => i.orderId.slice(-1));

    // One Bangkok day: A and B, newest first. C is the next day, D a month before.
    const day = await get({ from: "2001-05-10", to: "2001-05-11" });
    assert.equal(day.status, 200);
    assert.deepEqual(ids(day), ["B", "A"]);
    assert.equal(day.body.total, 2);
    assert.deepEqual(day.body.statusCounts, {
      OPEN: 1,
      NEEDS_INFO: 1,
      DECIDED: 0,
    });
    assert.deepEqual(day.body.options.statuses, [
      "OPEN",
      "NEEDS_INFO",
      "DECIDED",
    ]);
    assert.deepEqual(day.body.options.priorities, [
      "LOW",
      "NORMAL",
      "HIGH",
      "URGENT",
      "CRITICAL",
    ]);
    assert.equal(day.body.meta.timezone, "Asia/Bangkok");

    // Only what the page shows comes back.
    const first = day.body.items[1];
    assert.deepEqual(Object.keys(first).sort(), [
      "createdAt",
      "decision",
      "disputeType",
      "id",
      "orderId",
      "priority",
      "reason",
      "status",
    ]);
    assert.equal(first.createdAt, "2001-05-10T05:00:00.000Z");

    // A wider range, then each filter on its own.
    const range = { from: "2001-05-10", to: "2001-05-12" };
    assert.deepEqual(ids(await get(range)), ["C", "B", "A"]);
    assert.deepEqual(ids(await get({ ...range, status: "DECIDED" })), ["C"]);
    assert.deepEqual(
      ids(await get({ ...range, disputeType: "DAMAGED_ITEM" })),
      ["C", "A"],
    );
    assert.deepEqual(ids(await get({ ...range, priority: "NORMAL" })), ["B"]);
    // Filters combine, and the status counts ignore only the status filter.
    const combined = await get({
      ...range,
      disputeType: "DAMAGED_ITEM",
      status: "OPEN",
    });
    assert.deepEqual(ids(combined), ["A"]);
    assert.deepEqual(combined.body.statusCounts, {
      OPEN: 1,
      NEEDS_INFO: 0,
      DECIDED: 1,
    });

    // Paging.
    const page = await get({ ...range, limit: 2, page: 2 });
    assert.deepEqual(ids(page), ["A"]);
    assert.equal(page.body.total, 3);
    assert.equal(page.body.totalPages, 2);

    // A value the page does not offer is refused, not matched against nothing.
    for (const bad of [
      { status: "RESOLVED" },
      { disputeType: "ANYTHING" },
      { priority: "MEH" },
    ]) {
      assert.equal((await get({ ...range, ...bad })).status, 400);
    }

    const forbidden = await request(app)
      .get("/executive/disputes")
      .set("Authorization", `Bearer ${buyerToken}`);
    assert.equal(forbidden.status, 403);
    assert.equal((await request(app).get("/executive/disputes")).status, 401);
  } finally {
    const orderIds = cases.map((c) => c.orderId);
    await prisma.disputeCase.deleteMany({
      where: { orderId: { in: orderIds } },
    });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.$disconnect();
  }
});
