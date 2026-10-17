// Integration test against a real, disposable Postgres database (reloop_order).
// Skips cleanly when DATABASE_URL is unset/unreachable so `npm test` still
// passes on a machine with no database configured. Set REQUIRE_INTEGRATION=1
// (the CI workflow does) to turn that skip into a hard failure instead.
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";
process.env.INTERNAL_SERVICE_TOKEN ||= "test-internal-token";
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

test("internal product sales against a real database", async (t) => {
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
  const buyerId = `mock-product-sales-buyer-${runId}`;
  const internal = { "x-internal-token": process.env.INTERNAL_SERVICE_TOKEN };
  const executiveToken = signAccessToken({
    sub: "int-test-executive",
    role: "EXECUTIVE",
    displayName: "Trusted Integration Executive",
  });

  const inWindow = new Date("2017-03-10T10:00:00.000Z");
  // 01:00 Bangkok on 1 March, still 28 February in UTC.
  const bangkokMarch1 = new Date("2017-02-28T18:00:00.000Z");
  // 01:00 Bangkok on 1 April, still 31 March in UTC.
  const bangkokApril1 = new Date("2017-03-31T18:00:00.000Z");

  // [product, status, list price, paid price, created at]
  const fixtures = [
    // bag-1: two sales; one used a 100 coupon, so the paid total is 1900.
    ["bag-1", "completed", 1000, 1000, inWindow],
    ["bag-1", "completed", 1000, 900, inWindow],
    ["shoe-1", "completed", 700, 700, inWindow],
    // Not sales: never completed, or refunded afterwards.
    ["shoe-1", "pending_payment", 700, 700, inWindow],
    ["shoe-1", "cancelled", 700, 700, inWindow],
    ["shoe-1", "refunded", 700, 700, inWindow],
    // Boundaries in Bangkok time.
    ["dress-1", "completed", 500, 500, bangkokMarch1],
    ["dress-2", "completed", 800, 800, bangkokApril1],
  ].map(([product, status, original, paid, createdAt], i) => ({
    id: `mock-product-sales-${runId}-${i}`,
    productId: `${product}-${runId}`,
    status,
    original,
    paid,
    createdAt,
  }));
  const productOf = (name) => `${name}-${runId}`;

  try {
    await prisma.order.createMany({
      data: fixtures.map((f) => ({
        id: f.id,
        buyerId,
        sellerId: "s1",
        productId: f.productId,
        originalAmount: f.original,
        ordersAmount: f.paid,
        orderType: "BUY_NOW",
        status: f.status,
        createdAt: f.createdAt,
      })),
    });

    const march = await request(app)
      .get("/internal/executive/product-sales")
      .query({
        from: "2017-03-01",
        to: "2017-04-01",
        timezone: "Asia/Bangkok",
      })
      .set(internal);

    assert.equal(march.status, 200);
    // Highest paid total first; the coupon shows in bag-1 as 1900, not 2000.
    assert.deepEqual(march.body.data, [
      { productId: productOf("bag-1"), count: 2, gmv: 1900 },
      { productId: productOf("shoe-1"), count: 1, gmv: 700 },
      { productId: productOf("dress-1"), count: 1, gmv: 500 },
    ]);
    assert.equal(march.body.meta.timezone, "Asia/Bangkok");
    assert.equal(march.body.meta.from, "2017-02-28T17:00:00.000Z");

    // The rows add up to the GMV the dashboard card shows for the same window.
    const sales = await request(app)
      .get("/executive/metrics")
      .query({ from: "2017-03-01", to: "2017-04-01" })
      .set("Authorization", `Bearer ${executiveToken}`);
    assert.equal(sales.status, 200);
    assert.equal(
      march.body.data.reduce((total, row) => total + row.gmv, 0),
      sales.body.data.gmv,
    );
    assert.equal(
      march.body.data.reduce((total, row) => total + row.count, 0),
      sales.body.data.completedOrders,
    );

    const april = await request(app)
      .get("/internal/executive/product-sales")
      .query({ from: "2017-04-01", to: "2017-05-01" })
      .set(internal);
    assert.deepEqual(april.body.data, [
      { productId: productOf("dress-2"), count: 1, gmv: 800 },
    ]);

    const empty = await request(app)
      .get("/internal/executive/product-sales")
      .query({ from: "2018-01-01", to: "2018-02-01" })
      .set(internal);
    assert.deepEqual(empty.body.data, []);

    // Service-to-service only: a user token or a wrong token is refused.
    const userToken = await request(app)
      .get("/internal/executive/product-sales")
      .set("Authorization", `Bearer ${executiveToken}`);
    assert.equal(userToken.status, 403);
    const wrongToken = await request(app)
      .get("/internal/executive/product-sales")
      .set({ "x-internal-token": "not-the-token" });
    assert.equal(wrongToken.status, 403);
    const noToken = await request(app).get("/internal/executive/product-sales");
    assert.equal(noToken.status, 403);

    const badTimezone = await request(app)
      .get("/internal/executive/product-sales")
      .query({ timezone: "Mars/Olympus" })
      .set(internal);
    assert.equal(badTimezone.status, 400);
  } finally {
    await prisma.order.deleteMany({
      where: { id: { in: fixtures.map((f) => f.id) } },
    });
    await prisma.$disconnect();
  }
});
