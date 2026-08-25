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

const FIXTURE_BUYER_PREFIX = "mock-trade-executive-metrics-buyer-";

async function databaseIsReachable() {
  if (!process.env.DATABASE_URL) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

test("executive platform metrics against a real database", async (t) => {
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

  // Window fixtures fall inside; two completed orders (1000 + 2000 = gmv 3000,
  // platformRevenue 300 at the 10% default rate) plus one pending and one
  // cancelled order that must NOT count toward gmv/completedOrders.
  const windowFrom = new Date("2026-01-01T00:00:00.000Z");
  const windowTo = new Date("2026-02-01T00:00:00.000Z");
  const insideWindow = new Date("2026-01-15T00:00:00.000Z");
  const outsideWindow = new Date("2025-12-15T00:00:00.000Z");

  try {
    await prisma.order.createMany({
      data: [
        {
          buyerId,
          sellerId: "s1",
          productId: "p1",
          productTitle: "completed in window #1",
          price: 1000,
          status: "completed",
          createdAt: insideWindow,
        },
        {
          buyerId,
          sellerId: "s1",
          productId: "p2",
          productTitle: "completed in window #2",
          price: 2000,
          status: "completed",
          createdAt: insideWindow,
        },
        {
          buyerId,
          sellerId: "s1",
          productId: "p3",
          productTitle: "pending in window — must not count",
          price: 5000,
          status: "pending",
          createdAt: insideWindow,
        },
        {
          buyerId,
          sellerId: "s1",
          productId: "p4",
          productTitle: "completed outside window — must not count",
          price: 9000,
          status: "completed",
          createdAt: outsideWindow,
        },
      ],
    });

    const res = await request(app)
      .get("/executive/metrics")
      .query({ from: windowFrom.toISOString(), to: windowTo.toISOString() })
      .set("Authorization", `Bearer ${executiveToken}`);

    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, {
      gmv: 3000,
      platformRevenue: 300,
      completedOrders: 2,
    });
    assert.equal(res.body.meta.definitionVersion, "v1");
    assert.equal(res.body.meta.timezone, "Asia/Bangkok");

    const forbiddenRes = await request(app)
      .get("/executive/metrics")
      .set("Authorization", `Bearer ${buyerToken}`);
    assert.equal(forbiddenRes.status, 403);

    const unauthenticatedRes = await request(app).get("/executive/metrics");
    assert.equal(unauthenticatedRes.status, 401);
  } finally {
    await prisma.order.deleteMany({ where: { buyerId } });
    await prisma.$disconnect();
  }
});
