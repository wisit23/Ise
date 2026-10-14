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

const FIXTURE_BUYER_PREFIX = "mock-trade-metrics-series-buyer-";

async function databaseIsReachable() {
  if (!process.env.DATABASE_URL) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

test("executive platform metrics series against a real database", async (t) => {
  if (!(await databaseIsReachable())) {
    const message =
      "DATABASE_URL not set or database unreachable — set it to a disposable test database " +
      "(after running `npx prisma db push` against it from backend/services/order-service) to run this test";
    if (process.env.REQUIRE_INTEGRATION === "1") {
      throw new Error(`REQUIRE_INTEGRATION=1 but ${message}`);
    }
    t.skip(message);
    return;
  }

  const buyerId = `${FIXTURE_BUYER_PREFIX}${Date.now()}`;
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

  // A year far in the past so pre-existing demo/seed orders in the shared
  // dev database cannot land inside this window and perturb the series.
  // Buckets are Bangkok calendar days (UTC+7): a Bangkok day starts at
  // 17:00 UTC the previous day.
  const day5 = new Date("2019-03-05T10:00:00.000Z");
  const day10 = new Date("2019-03-10T10:00:00.000Z");
  // 01:00 Bangkok on 1 March, still 28 February in UTC.
  const bangkokMarch1 = new Date("2019-02-28T18:00:00.000Z");
  // 01:00 Bangkok on 1 April, still 31 March in UTC.
  const bangkokApril1 = new Date("2019-03-31T18:00:00.000Z");

  try {
    await prisma.order.createMany({
      data: [
        {
          buyerId,
          sellerId: "s1",
          productId: "p1",
          originalAmount: 200,
          ordersAmount: 200,
          orderType: "BUY_NOW",
          status: "completed",
          createdAt: day5,
        },
        {
          buyerId,
          sellerId: "s1",
          productId: "p2",
          originalAmount: 300,
          ordersAmount: 300,
          orderType: "BUY_NOW",
          status: "completed",
          createdAt: day5,
        },
        {
          buyerId,
          sellerId: "s1",
          productId: "p3",
          originalAmount: 300,
          ordersAmount: 300,
          orderType: "BUY_NOW",
          status: "completed",
          createdAt: day10,
        },
        {
          buyerId,
          sellerId: "s1",
          productId: "p5",
          originalAmount: 40,
          ordersAmount: 40,
          orderType: "BUY_NOW",
          status: "completed",
          createdAt: bangkokMarch1,
        },
        {
          buyerId,
          sellerId: "s1",
          productId: "p6",
          originalAmount: 70,
          ordersAmount: 70,
          orderType: "BUY_NOW",
          status: "completed",
          createdAt: bangkokApril1,
        },
        {
          buyerId,
          sellerId: "s1",
          productId: "p4",
          originalAmount: 9000,
          ordersAmount: 9000,
          orderType: "BUY_NOW",
          status: "pending",
          createdAt: day5,
        },
      ],
    });

    const res = await request(app)
      .get("/executive/metrics-series")
      .query({
        from: "2019-03-01",
        to: "2019-04-01",
        granularity: "day",
        timezone: "Asia/Bangkok",
      })
      .set("Authorization", `Bearer ${executiveToken}`);

    assert.equal(res.status, 200);
    // March 2019 has 31 days — every day appears exactly once, in order,
    // even the days with no orders at all.
    assert.equal(res.body.data.length, 31);
    assert.equal(res.body.data[0].period, "2019-02-28T17:00:00.000Z");
    assert.equal(res.body.data[30].period, "2019-03-30T17:00:00.000Z");

    // Placed on 28 Feb UTC but 1 March in Bangkok: belongs to 1 March.
    const day1Row = res.body.data.find(
      (r) => r.period === "2019-02-28T17:00:00.000Z",
    );
    assert.deepEqual(day1Row, {
      period: "2019-02-28T17:00:00.000Z",
      gmv: 40,
      platformRevenue: 1.2,
      completedOrders: 1,
    });

    const day2Row = res.body.data.find(
      (r) => r.period === "2019-03-01T17:00:00.000Z",
    );
    assert.equal(day2Row.gmv, 0);

    // Placed on 31 March UTC but 1 April in Bangkok: not part of March.
    const day31Row = res.body.data.find(
      (r) => r.period === "2019-03-30T17:00:00.000Z",
    );
    assert.equal(day31Row.gmv, 0);

    const day5Row = res.body.data.find(
      (r) => r.period === "2019-03-04T17:00:00.000Z",
    );
    assert.equal(day5Row.gmv, 500);
    assert.equal(day5Row.completedOrders, 2);
    assert.equal(day5Row.platformRevenue, 15);

    const day10Row = res.body.data.find(
      (r) => r.period === "2019-03-09T17:00:00.000Z",
    );
    assert.equal(day10Row.gmv, 300);
    assert.equal(day10Row.completedOrders, 1);

    assert.equal(res.body.meta.definitionVersion, "v1");
    assert.equal(res.body.meta.timezone, "Asia/Bangkok");
    assert.equal(res.body.meta.from, "2019-02-28T17:00:00.000Z");

    // The non-series total uses the same Bangkok month boundaries.
    const totalRes = await request(app)
      .get("/executive/metrics")
      .query({ from: "2019-03-01", to: "2019-04-01" })
      .set("Authorization", `Bearer ${executiveToken}`);
    assert.equal(totalRes.status, 200);
    assert.equal(totalRes.body.data.gmv, 840);
    assert.equal(totalRes.body.data.completedOrders, 4);

    // Month granularity across the whole year: the March days collapse into
    // one Bangkok March bucket (40 + 500 + 300 = 840), and the order placed at
    // 01:00 Bangkok on 1 April lands in April.
    const yearRes = await request(app)
      .get("/executive/metrics-series")
      .query({
        from: "2019-01-01",
        to: "2020-01-01",
        granularity: "month",
      })
      .set("Authorization", `Bearer ${executiveToken}`);
    assert.equal(yearRes.status, 200);
    assert.equal(yearRes.body.data.length, 12);
    const marchRow = yearRes.body.data.find(
      (r) => r.period === "2019-02-28T17:00:00.000Z",
    );
    assert.equal(marchRow.gmv, 840);
    assert.equal(marchRow.completedOrders, 4);
    const aprilRow = yearRes.body.data.find(
      (r) => r.period === "2019-03-31T17:00:00.000Z",
    );
    assert.equal(aprilRow.gmv, 70);

    const badTimezoneRes = await request(app)
      .get("/executive/metrics-series")
      .query({ granularity: "day", timezone: "Mars/Olympus" })
      .set("Authorization", `Bearer ${executiveToken}`);
    assert.equal(badTimezoneRes.status, 400);

    const missingGranularityRes = await request(app)
      .get("/executive/metrics-series")
      .set("Authorization", `Bearer ${executiveToken}`);
    assert.equal(missingGranularityRes.status, 400);

    const badGranularityRes = await request(app)
      .get("/executive/metrics-series")
      .query({ granularity: "hour" })
      .set("Authorization", `Bearer ${executiveToken}`);
    assert.equal(badGranularityRes.status, 400);

    const forbiddenRes = await request(app)
      .get("/executive/metrics-series")
      .query({ granularity: "day" })
      .set("Authorization", `Bearer ${buyerToken}`);
    assert.equal(forbiddenRes.status, 403);

    const unauthenticatedRes = await request(app).get(
      "/executive/metrics-series",
    );
    assert.equal(unauthenticatedRes.status, 401);
  } finally {
    await prisma.order.deleteMany({ where: { buyerId } });
    await prisma.$disconnect();
  }
});
