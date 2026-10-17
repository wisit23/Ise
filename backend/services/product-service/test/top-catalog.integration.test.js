// Integration test against a real, disposable Postgres database (reloop_product).
// Order-service is replaced by a small local HTTP server, so the test covers
// the real client over HTTP without needing the order database.
// Skips cleanly when DATABASE_URL is unset/unreachable so `npm test` still
// passes on a machine with no database configured. Set REQUIRE_INTEGRATION=1
// (the CI workflow does) to turn that skip into a hard failure instead.
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const request = require("supertest");

process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";
process.env.INTERNAL_SERVICE_TOKEN = "top-catalog-internal-token";
if (process.env.DATABASE_URL_PRODUCT) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_PRODUCT;
}

const { signAccessToken } = require("@reloop/shared");
const prisma = require("../src/models/prismaClient");
const app = require("../src/app");
// This feature suite uses signed identity fixtures; live session enforcement
// is covered separately by account-suspension.integration.test.js.
app.locals.validateAccessSession = async () => {};

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

  const runId = Date.now();
  const sellerId = `${FIXTURE_SELLER_PREFIX}${runId}`;
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

  const id = (name) => `top-catalog-${runId}-${name}`;
  const base = (name, category, price) => ({
    id: id(name),
    sellerId,
    title: name,
    category,
    price,
  });

  // What order-service answers with: sales per product at the price paid.
  // bag-a listed at 2000 but a 200 coupon was used, so 1800 was paid.
  let ordersAnswer = {
    status: 200,
    body: {
      data: [
        { productId: id("bag-a"), count: 1, gmv: 1800 },
        { productId: id("bag-b"), count: 1, gmv: 1000 },
        { productId: id("shoe-a"), count: 1, gmv: 1500 },
        // A product that has since been deleted from the catalog: its sale
        // still counts, under "no category".
        { productId: id("deleted"), count: 1, gmv: 400 },
        // Cheap but frequent: the most popular category by pieces sold.
        { productId: id("tie-b"), count: 3, gmv: 100 },
        { productId: id("tie-a"), count: 2, gmv: 100 },
      ],
    },
  };
  const received = [];
  const orderService = http.createServer((req, res) => {
    received.push({ url: req.url, token: req.headers["x-internal-token"] });
    res.writeHead(ordersAnswer.status, { "content-type": "application/json" });
    res.end(JSON.stringify(ordersAnswer.body));
  });
  await new Promise((resolve) => orderService.listen(0, "127.0.0.1", resolve));
  process.env.ORDER_SERVICE_URL = `http://127.0.0.1:${orderService.address().port}`;

  const query = {
    from: "2019-01-01",
    to: "2019-02-01",
    timezone: "Asia/Bangkok",
  };
  const rankings = (extra = {}) =>
    request(app)
      .get("/executive/top-catalog")
      .query({ ...query, ...extra })
      .set("Authorization", `Bearer ${executiveToken}`);

  try {
    await prisma.product.createMany({
      data: [
        base("bag-a", "กระเป๋า", 2000),
        base("bag-b", "กระเป๋า", 1000),
        base("shoe-a", "รองเท้า", 1500),
        base("tie-a", "test", 100),
        base("tie-b", "test", 100),
        // Sold per the catalog but with no completed order: not a sale here.
        { ...base("unsold-in-orders", "เดรส", 8000), status: "sold" },
      ],
    });

    const res = await rankings();

    assert.equal(res.status, 200);
    // By what was paid: bag-a (1800) + bag-b (1000). The cheap category
    // that sells most pieces comes last here.
    assert.deepEqual(res.body.data.categories, [
      { id: "กระเป๋า", label: "กระเป๋า", count: 2, gmv: 2800 },
      { id: "รองเท้า", label: "รองเท้า", count: 1, gmv: 1500 },
      { id: "__uncategorized__", label: null, count: 1, gmv: 400 },
      { id: "test", label: "test", count: 5, gmv: 200 },
    ]);
    // By pieces sold: the order flips, and ties fall back to what was paid.
    assert.deepEqual(
      res.body.data.popularCategories.map((c) => [c.label, c.count]),
      [
        ["test", 5],
        ["กระเป๋า", 2],
        ["รองเท้า", 1],
        [null, 1],
      ],
    );
    // All categories together, so shares are shares of everything sold.
    assert.deepEqual(res.body.data.categoryTotal, { count: 9, gmv: 4900 });
    // Second-hand items sell once, so there is no product ranking.
    assert.equal(res.body.data.products, undefined);

    assert.equal(res.body.meta.definitionVersion, "v1");
    assert.equal(res.body.meta.timezone, "Asia/Bangkok");

    // The window and zone reach order-service as exact instants, with the
    // service token and nothing from the user's own request.
    const sent = new URL(received[0].url, "http://order-service");
    assert.equal(sent.pathname, "/internal/executive/product-sales");
    assert.equal(sent.searchParams.get("from"), "2018-12-31T17:00:00.000Z");
    assert.equal(sent.searchParams.get("to"), "2019-01-31T17:00:00.000Z");
    assert.equal(sent.searchParams.get("timezone"), "Asia/Bangkok");
    assert.equal(received[0].token, "top-catalog-internal-token");

    // limit is honoured and validated.
    const limitedRes = await rankings({ limit: 1 });
    assert.equal(limitedRes.status, 200);
    assert.equal(limitedRes.body.data.categories.length, 1);
    assert.equal(limitedRes.body.data.categories[0].id, "กระเป๋า");
    // The total still covers every category, not just the ranked one.
    assert.deepEqual(limitedRes.body.data.categoryTotal, {
      count: 9,
      gmv: 4900,
    });
    assert.equal(limitedRes.body.data.popularCategories.length, 1);
    assert.equal(limitedRes.body.data.popularCategories[0].id, "test");

    const badLimitRes = await rankings({ limit: "0" });
    assert.equal(badLimitRes.status, 400);

    // No completed orders in the window: an empty ranking, not an error.
    ordersAnswer = { status: 200, body: { data: [] } };
    const emptyRes = await rankings();
    assert.equal(emptyRes.status, 200);
    assert.deepEqual(emptyRes.body.data, {
      categories: [],
      popularCategories: [],
      categoryTotal: { count: 0, gmv: 0 },
    });

    // Order-service failing must surface as unavailable, never as an empty
    // ranking that would read as "nothing sold".
    ordersAnswer = { status: 500, body: { error: "boom" } };
    assert.equal((await rankings()).status, 502);
    ordersAnswer = { status: 200, body: { data: "not a list" } };
    assert.equal((await rankings()).status, 502);
    ordersAnswer = {
      status: 200,
      body: { data: [{ productId: "p", count: 1, gmv: "12" }] },
    };
    assert.equal((await rankings()).status, 502);

    await new Promise((resolve) => orderService.close(resolve));
    assert.equal((await rankings()).status, 502);

    const forbiddenRes = await request(app)
      .get("/executive/top-catalog")
      .set("Authorization", `Bearer ${sellerToken}`);
    assert.equal(forbiddenRes.status, 403);

    const unauthenticatedRes = await request(app).get("/executive/top-catalog");
    assert.equal(unauthenticatedRes.status, 401);
  } finally {
    if (orderService.listening) {
      await new Promise((resolve) => orderService.close(resolve));
    }
    await prisma.product.deleteMany({ where: { sellerId } });
    await prisma.$disconnect();
  }
});
