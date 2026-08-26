// Integration test against a real, disposable Postgres database (reloop_product).
// Skips cleanly when DATABASE_URL is unset/unreachable so `npm test` still
// passes on a machine with no database configured. Set REQUIRE_INTEGRATION=1
// (the CI workflow does) to turn that skip into a hard failure instead.
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";
if (process.env.DATABASE_URL_PRODUCT) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_PRODUCT;
}

const { signAccessToken } = require("@reloop/shared");
const prisma = require("../src/models/prismaClient");
const app = require("../src/app");

const FIXTURE_SELLER_PREFIX = "mock-trade-executive-metrics-seller-";

async function databaseIsReachable() {
  if (!process.env.DATABASE_URL) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

test("executive catalog metrics against a real database", async (t) => {
  if (!(await databaseIsReachable())) {
    const message =
      "DATABASE_URL not set or database unreachable — set it to a disposable test database " +
      "(after running `npx prisma db push` against it from backend/services/product-service) to run this test";
    if (process.env.REQUIRE_INTEGRATION === "1") {
      throw new Error(`REQUIRE_INTEGRATION=1 but ${message}`);
    }
    t.skip(message);
    return;
  }

  const sellerId = `${FIXTURE_SELLER_PREFIX}${Date.now()}`;
  const executiveToken = signAccessToken({
    sub: "int-test-executive",
    role: "EXECUTIVE",
    displayName: "Trusted Integration Executive",
  });
  const sellerToken = signAccessToken({
    sub: sellerId,
    role: "SELLER",
    displayName: "Trusted Integration Seller",
  });

  const windowFrom = new Date("2026-01-01T00:00:00.000Z");
  const windowTo = new Date("2026-02-01T00:00:00.000Z");
  const insideWindow = new Date("2026-01-15T00:00:00.000Z");
  const outsideWindow = new Date("2025-12-15T00:00:00.000Z");

  const base = (overrides) => ({
    sellerId,
    title: "mock-trade-executive-metrics fixture",
    price: 100,
    category: "test",
    ...overrides,
  });

  const callMetrics = () =>
    request(app)
      .get("/executive/metrics")
      .query({ from: windowFrom.toISOString(), to: windowTo.toISOString() })
      .set("Authorization", `Bearer ${executiveToken}`);

  try {
    // activeListings is a platform-wide live gauge, so no exact value can be
    // asserted here: `npm test` runs every backend test file in parallel
    // against one database and product-crud/top-catalog create `available`
    // rows of their own. Bracket the insert with two calls and assert the
    // delta instead — concurrent inserts can only inflate it, so `>=` stays
    // true, while a regression that window-scoped the gauge would report a
    // delta of 1 (only the in-window row) and fail.
    const beforeRes = await callMetrics();
    assert.equal(beforeRes.status, 200);
    const activeBefore = beforeRes.body.data.activeListings;

    await prisma.product.createMany({
      data: [
        // newListings: 2 created inside the window (any status).
        base({ status: "available", createdAt: insideWindow }),
        base({
          status: "sold",
          createdAt: insideWindow,
          updatedAt: insideWindow,
        }),
        // Created outside the window — must not count as newListings.
        base({ status: "available", createdAt: outsideWindow }),
        // soldListings: only the one above (sold + updatedAt inside window).
        // activeListings: live count of status='available', regardless of window.
        base({ status: "available", createdAt: outsideWindow }),
      ],
    });

    const res = await callMetrics();

    assert.equal(res.status, 200);
    // Window-scoped metrics are exact: the fixture's timestamps are explicit
    // and no other test writes into this window.
    assert.equal(res.body.data.newListings, 2);
    assert.equal(res.body.data.soldListings, 1);
    // The live gauge picked up all 3 available rows, including the two created
    // outside the metric window — proving it is not window-scoped.
    assert.ok(
      res.body.data.activeListings - activeBefore >= 3,
      `activeListings should have risen by at least 3 (was ${activeBefore}, now ${res.body.data.activeListings})`,
    );
    assert.equal(res.body.meta.definitionVersion, "v1");
    assert.equal(res.body.meta.timezone, "Asia/Bangkok");

    const forbiddenRes = await request(app)
      .get("/executive/metrics")
      .set("Authorization", `Bearer ${sellerToken}`);
    assert.equal(forbiddenRes.status, 403);

    const unauthenticatedRes = await request(app).get("/executive/metrics");
    assert.equal(unauthenticatedRes.status, 401);
  } finally {
    await prisma.product.deleteMany({ where: { sellerId } });
    await prisma.$disconnect();
  }
});
