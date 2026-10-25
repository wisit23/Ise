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

test("executive order status breakdown against a real database", async (t) => {
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
  const buyerId = `mock-order-status-buyer-${runId}`;
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

  // A far-past window so pre-existing demo orders cannot land inside it.
  const inWindow = new Date("2015-03-10T10:00:00.000Z");
  // 01:00 Bangkok on 1 March, still 28 February in UTC.
  const bangkokMarch1 = new Date("2015-02-28T18:00:00.000Z");
  // 01:00 Bangkok on 1 April, still 31 March in UTC.
  const bangkokApril1 = new Date("2015-03-31T18:00:00.000Z");

  // [status, payment status | null, created at]
  const fixtures = [
    ["completed", "paid", inWindow],
    ["completed", "paid", inWindow],
    // Paid and waiting for the seller, then each step to the buyer's door.
    ["paid", "paid", inWindow],
    ["confirmed", "paid", inWindow],
    ["ready_to_ship", "paid", inWindow],
    ["pickup_in_progress", "paid", inWindow],
    ["in_transit", "paid", inWindow],
    ["delivered", "paid", inWindow],
    ["disputed", "paid", inWindow],
    ["refunded", "paid", inWindow],
    // Never paid: a cart abandoned at the payment step is not a sale.
    ["pending_payment", null, inWindow],
    ["cancelled", null, inWindow],
    ["payment_expired", null, inWindow],
    // A simulated refund on seller timeout is not a completed sale.
    ["seller_confirmation_expired", "paid", inWindow],
    // A status that normally follows payment, but whose payment never cleared.
    ["completed", "pending", inWindow],
    // Boundary: belongs to March in Bangkok even though UTC says February.
    ["completed", "paid", bangkokMarch1],
    // Boundary: belongs to April in Bangkok even though UTC says March.
    ["completed", "paid", bangkokApril1],
  ].map(([status, payment, createdAt], i) => ({
    id: `mock-order-status-${runId}-${i}`,
    status,
    payment,
    createdAt,
  }));

  try {
    await prisma.order.createMany({
      data: fixtures.map(({ id, status, createdAt }) => ({
        id,
        buyerId,
        sellerId: "s1",
        productId: `p-${id}`,
        originalAmount: 100,
        ordersAmount: 100,
        orderType: "BUY_NOW",
        status,
        createdAt,
      })),
    });
    await prisma.payment.createMany({
      data: fixtures
        .filter((f) => f.payment)
        .map((f) => ({
          orderId: f.id,
          paymentType: "DEMO",
          paymentStatus: f.payment,
          paymentAmount: 100,
        })),
    });

    const march = await request(app)
      .get("/executive/order-status")
      .query({
        from: "2015-03-01",
        to: "2015-04-01",
        timezone: "Asia/Bangkok",
      })
      .set("Authorization", `Bearer ${executiveToken}`);

    assert.equal(march.status, 200);
    // completed: 2 in the window + the 01:00 Bangkok 1 March order. The
    // unpaid "completed" one and the 1 April one are excluded.
    assert.deepEqual(march.body.data, {
      completed: 3,
      inProgress: 6,
      disputeRefund: 2,
      total: 11,
    });
    assert.equal(march.body.meta.definitionVersion, "v1");
    assert.equal(march.body.meta.timezone, "Asia/Bangkok");
    assert.equal(march.body.meta.from, "2015-02-28T17:00:00.000Z");

    // The completed count is the same figure the sales KPI card uses.
    const sales = await request(app)
      .get("/executive/metrics")
      .query({ from: "2015-03-01", to: "2015-04-01" })
      .set("Authorization", `Bearer ${executiveToken}`);
    assert.equal(sales.status, 200);
    assert.equal(
      sales.body.data.completedOrders - 1,
      march.body.data.completed,
      "metrics also counts the completed order whose payment never cleared",
    );

    const april = await request(app)
      .get("/executive/order-status")
      .query({ from: "2015-04-01", to: "2015-05-01" })
      .set("Authorization", `Bearer ${executiveToken}`);
    assert.deepEqual(april.body.data, {
      completed: 1,
      inProgress: 0,
      disputeRefund: 0,
      total: 1,
    });

    const empty = await request(app)
      .get("/executive/order-status")
      .query({ from: "2018-01-01", to: "2018-02-01" })
      .set("Authorization", `Bearer ${executiveToken}`);
    assert.deepEqual(empty.body.data, {
      completed: 0,
      inProgress: 0,
      disputeRefund: 0,
      total: 0,
    });

    const badTimezone = await request(app)
      .get("/executive/order-status")
      .query({ timezone: "Mars/Olympus" })
      .set("Authorization", `Bearer ${executiveToken}`);
    assert.equal(badTimezone.status, 400);

    const forbidden = await request(app)
      .get("/executive/order-status")
      .set("Authorization", `Bearer ${buyerToken}`);
    assert.equal(forbidden.status, 403);

    const unauthenticated = await request(app).get("/executive/order-status");
    assert.equal(unauthenticated.status, 401);
  } finally {
    const ids = fixtures.map((f) => f.id);
    await prisma.payment.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.order.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  }
});
