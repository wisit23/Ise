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
  const monthFrom = new Date("2019-03-01T00:00:00.000Z");
  const monthTo = new Date("2019-04-01T00:00:00.000Z");
  const day5 = new Date("2019-03-05T10:00:00.000Z");
  const day10 = new Date("2019-03-10T10:00:00.000Z");

  try {
    await prisma.order.createMany({
      data: [
        {
          buyerId,
          sellerId: "s1",
          productId: "p1",
          productTitle: "day-5 sale #1",
          price: 200,
          status: "completed",
          createdAt: day5,
        },
        {
          buyerId,
          sellerId: "s1",
          productId: "p2",
          productTitle: "day-5 sale #2",
          price: 300,
          status: "completed",
          createdAt: day5,
        },
        {
          buyerId,
          sellerId: "s1",
          productId: "p3",
          productTitle: "day-10 sale",
          price: 300,
          status: "completed",
          createdAt: day10,
        },
        {
          buyerId,
          sellerId: "s1",
          productId: "p4",
          productTitle: "day-5 pending — must not count",
          price: 9000,
          status: "pending",
          createdAt: day5,
        },
      ],
    });

    const res = await request(app)
      .get("/executive/metrics-series")
      .query({
        from: monthFrom.toISOString(),
        to: monthTo.toISOString(),
        granularity: "day",
      })
      .set("Authorization", `Bearer ${executiveToken}`);

    assert.equal(res.status, 200);
    // March 2019 has 31 days — every day appears exactly once, in order,
    // even the 28 with no orders at all.
    assert.equal(res.body.data.length, 31);
    assert.equal(res.body.data[0].period, "2019-03-01T00:00:00.000Z");
    assert.equal(res.body.data[30].period, "2019-03-31T00:00:00.000Z");

    const day1Row = res.body.data.find(
      (r) => r.period === "2019-03-01T00:00:00.000Z",
    );
    assert.deepEqual(day1Row, {
      period: "2019-03-01T00:00:00.000Z",
      gmv: 0,
      platformRevenue: 0,
      completedOrders: 0,
    });

    const day5Row = res.body.data.find(
      (r) => r.period === "2019-03-05T00:00:00.000Z",
    );
    assert.equal(day5Row.gmv, 500);
    assert.equal(day5Row.completedOrders, 2);
    assert.equal(day5Row.platformRevenue, 50);

    const day10Row = res.body.data.find(
      (r) => r.period === "2019-03-10T00:00:00.000Z",
    );
    assert.equal(day10Row.gmv, 300);
    assert.equal(day10Row.completedOrders, 1);

    assert.equal(res.body.meta.definitionVersion, "v1");

    // Month granularity across the whole year: the two days above collapse
    // into one March bucket (500 + 300 = 800); every other month is zero.
    const yearRes = await request(app)
      .get("/executive/metrics-series")
      .query({
        from: "2019-01-01T00:00:00.000Z",
        to: "2020-01-01T00:00:00.000Z",
        granularity: "month",
      })
      .set("Authorization", `Bearer ${executiveToken}`);
    assert.equal(yearRes.status, 200);
    assert.equal(yearRes.body.data.length, 12);
    const marchRow = yearRes.body.data.find(
      (r) => r.period === "2019-03-01T00:00:00.000Z",
    );
    assert.equal(marchRow.gmv, 800);
    assert.equal(marchRow.completedOrders, 3);

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
