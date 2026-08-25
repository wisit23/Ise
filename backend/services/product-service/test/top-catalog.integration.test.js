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

const FIXTURE_SELLER_PREFIX = "mock-trade-top-catalog-seller-";

async function databaseIsReachable() {
  if (!process.env.DATABASE_URL) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

test("executive catalog rankings against a real database", async (t) => {
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

  // A window far in the past, so pre-existing demo/seed rows in the shared
  // dev database cannot land inside it and perturb the ranking.
  const windowFrom = new Date("2019-01-01T00:00:00.000Z");
  const windowTo = new Date("2019-02-01T00:00:00.000Z");
  const insideWindow = new Date("2019-01-15T00:00:00.000Z");
  const outsideWindow = new Date("2018-12-15T00:00:00.000Z");

  const base = (overrides) => ({
    sellerId,
    title: "mock-trade-top-catalog fixture",
    price: 100,
    category: "test",
    ...overrides,
  });

  try {
    await prisma.product.createMany({
      data: [
        // "กระเป๋า": 2 sales totalling 3000 — highest gmv, rank 1.
        base({
          title: "bag-a",
          category: "กระเป๋า",
          price: 2000,
          status: "sold",
          createdAt: insideWindow,
          updatedAt: insideWindow,
        }),
        base({
          title: "bag-b",
          category: "กระเป๋า",
          price: 1000,
          status: "sold",
          createdAt: insideWindow,
          updatedAt: insideWindow,
        }),
        // "รองเท้า": 1 sale of 1500 — rank 2 by gmv despite fewer units.
        base({
          title: "shoe-a",
          category: "รองเท้า",
          price: 1500,
          status: "sold",
          createdAt: insideWindow,
          updatedAt: insideWindow,
        }),
        // Sold outside the window — must not appear at all.
        base({
          title: "old-sale",
          category: "เดรส",
          price: 9000,
          status: "sold",
          createdAt: outsideWindow,
          updatedAt: outsideWindow,
        }),
        // Still available — not a sale, must not appear.
        base({
          title: "unsold",
          category: "เดรส",
          price: 8000,
          status: "available",
          createdAt: insideWindow,
          updatedAt: insideWindow,
        }),
      ],
    });

    const res = await request(app)
      .get("/executive/top-catalog")
      .query({ from: windowFrom.toISOString(), to: windowTo.toISOString() })
      .set("Authorization", `Bearer ${executiveToken}`);

    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.categories, [
      { id: "กระเป๋า", label: "กระเป๋า", count: 2, gmv: 3000 },
      { id: "รองเท้า", label: "รองเท้า", count: 1, gmv: 1500 },
    ]);

    // Products rank by price; the unsold/out-of-window rows stay excluded.
    const productLabels = res.body.data.products.map((p) => p.label);
    assert.deepEqual(productLabels, ["bag-a", "shoe-a", "bag-b"]);

    assert.equal(res.body.meta.definitionVersion, "v1");
    assert.equal(res.body.meta.timezone, "Asia/Bangkok");

    // limit is honoured and validated.
    const limitedRes = await request(app)
      .get("/executive/top-catalog")
      .query({
        from: windowFrom.toISOString(),
        to: windowTo.toISOString(),
        limit: 1,
      })
      .set("Authorization", `Bearer ${executiveToken}`);
    assert.equal(limitedRes.status, 200);
    assert.equal(limitedRes.body.data.categories.length, 1);
    assert.equal(limitedRes.body.data.categories[0].id, "กระเป๋า");

    const badLimitRes = await request(app)
      .get("/executive/top-catalog")
      .query({ limit: "0" })
      .set("Authorization", `Bearer ${executiveToken}`);
    assert.equal(badLimitRes.status, 400);

    const forbiddenRes = await request(app)
      .get("/executive/top-catalog")
      .set("Authorization", `Bearer ${sellerToken}`);
    assert.equal(forbiddenRes.status, 403);

    const unauthenticatedRes = await request(app).get("/executive/top-catalog");
    assert.equal(unauthenticatedRes.status, 401);
  } finally {
    await prisma.product.deleteMany({ where: { sellerId } });
    await prisma.$disconnect();
  }
});
