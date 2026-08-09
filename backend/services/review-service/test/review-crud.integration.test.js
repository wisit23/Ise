// Integration test against a real, disposable Postgres database (reloop_review).
// Skips cleanly when DATABASE_URL is unset/unreachable so `npm test` still
// passes on a machine with no database configured. Set REQUIRE_INTEGRATION=1
// (the CI workflow does) to turn that skip into a hard failure instead.
//
// The full POST / (create review) path also needs order-service reachable
// (it validates the order via a service-to-service call) — that cross-service
// flow is covered by manual/E2E verification instead, not here, to keep this
// test isolated to review-service's own database.
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

if (process.env.DATABASE_URL_REVIEW) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_REVIEW;
}

const prisma = require("../src/models/prismaClient");
const app = require("../src/app");

const TEST_SELLER_PREFIX = "mock-trade-integration-seller-";

async function databaseIsReachable() {
  if (!process.env.DATABASE_URL) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

test("review aggregation against a real database", async (t) => {
  if (!(await databaseIsReachable())) {
    const message =
      "DATABASE_URL not set or database unreachable — set it to a disposable test database " +
      "(after running `npx prisma db push` against it from backend/services/review-service) to run this test";
    if (process.env.REQUIRE_INTEGRATION === "1") {
      throw new Error(`REQUIRE_INTEGRATION=1 but ${message}`);
    }
    t.skip(message);
    return;
  }

  const sellerId = `${TEST_SELLER_PREFIX}${Date.now()}`;

  try {
    await prisma.review.createMany({
      data: [
        {
          orderId: `${sellerId}-o1`,
          buyerId: "b1",
          sellerId,
          rating: 5,
          comment: "ดีมาก",
        },
        {
          orderId: `${sellerId}-o2`,
          buyerId: "b2",
          sellerId,
          rating: 3,
          comment: "",
        },
      ],
    });

    const listRes = await request(app).get(`/by-seller/${sellerId}`);
    assert.equal(listRes.status, 200);
    assert.equal(listRes.body.total, 2);
    assert.equal(listRes.body.averageRating, 4);

    const summaryRes = await request(app).get(`/by-seller/${sellerId}/summary`);
    assert.equal(summaryRes.status, 200);
    assert.equal(summaryRes.body.total, 2);
    assert.equal(summaryRes.body.averageRating, 4);

    const emptyRes = await request(app).get("/by-seller/does-not-exist");
    assert.equal(emptyRes.status, 200);
    assert.deepEqual(emptyRes.body.items, []);
    assert.equal(emptyRes.body.averageRating, 0);
  } finally {
    await prisma.review.deleteMany({ where: { sellerId } });
    await prisma.$disconnect();
  }
});
