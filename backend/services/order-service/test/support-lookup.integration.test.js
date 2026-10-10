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

const buyerId = `int-test-lookup-buyer-${Date.now()}`;
const buyerToken = signAccessToken({ sub: buyerId, role: "BUYER" });
const agentToken = signAccessToken({
  sub: "int-test-lookup-agent",
  role: "CUSTOMER_SERVICE",
});

async function databaseIsReachable() {
  if (!process.env.DATABASE_URL) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

test("support order lookup: role gate and bounded search", async (t) => {
  if (!(await databaseIsReachable())) {
    const message =
      "DATABASE_URL_ORDER not set or database unreachable — set it to a disposable test database " +
      "(after running `npx prisma db push` against it from backend/services/order-service) to run this test";
    if (process.env.REQUIRE_INTEGRATION === "1") {
      throw new Error(`REQUIRE_INTEGRATION=1 but ${message}`);
    }
    t.skip(message);
    return;
  }

  t.after(async () => {
    await prisma.order.deleteMany({ where: { buyerId } });
    await prisma.$disconnect();
  });

  const order = await prisma.order.create({
    data: {
      buyerId,
      sellerId: "int-test-lookup-seller",
      productId: "int-test-lookup-product",
      productTitle: "lookup test product",
      price: 500,
      status: "completed",
    },
  });
  const secondOrder = await prisma.order.create({
    data: {
      buyerId,
      sellerId: "int-test-lookup-seller-2",
      productId: "int-test-lookup-product-2",
      productTitle: "lookup pagination product",
      price: 700,
      status: "shipped",
    },
  });

  // A buyer (not an agent) cannot use the support lookup.
  const buyerRes = await request(app)
    .get("/support/search")
    .query({ orderId: order.id })
    .set("Authorization", `Bearer ${buyerToken}`);
  assert.equal(buyerRes.status, 403);

  // A search with no filter is rejected — it would let an agent dump the whole table.
  const emptyRes = await request(app)
    .get("/support/search")
    .set("Authorization", `Bearer ${agentToken}`);
  assert.equal(emptyRes.status, 400);

  // A bounded search by orderId finds it.
  const foundRes = await request(app)
    .get("/support/search")
    .query({ orderId: order.id })
    .set("Authorization", `Bearer ${agentToken}`);
  assert.equal(foundRes.status, 200);
  assert.ok(foundRes.body.items.some((o) => o.id === order.id));

  // A bounded search by buyerId also finds it.
  const byBuyerRes = await request(app)
    .get("/support/search")
    .query({ buyerId })
    .set("Authorization", `Bearer ${agentToken}`);
  assert.ok(byBuyerRes.body.items.some((o) => o.id === order.id));

  // TSR-07: owner API provides a globally correct total/summary and allows
  // every page to be opened instead of making the UI merge two first pages.
  const historyPage1 = await request(app)
    .get(`/support/users/${buyerId}/history`)
    .query({ role: "buyer", page: 1, limit: 1 })
    .set("Authorization", `Bearer ${agentToken}`);
  assert.equal(historyPage1.status, 200);
  assert.equal(historyPage1.body.total, 2);
  assert.equal(historyPage1.body.totalPages, 2);
  assert.equal(historyPage1.body.items.length, 1);
  assert.equal(historyPage1.body.summary.buyerOrders, 2);
  assert.equal(historyPage1.body.summary.completedOrders, 1);
  assert.equal(
    historyPage1.body.summary.completedOrdersMeaning,
    "order_status_completed",
  );
  assert.equal(historyPage1.body.summary.lateShipments, null);
  assert.ok(
    historyPage1.body.durationMs < 2000,
    `history query took ${historyPage1.body.durationMs}ms`,
  );

  const historyPage2 = await request(app)
    .get(`/support/users/${buyerId}/history`)
    .query({ role: "buyer", page: 2, limit: 1 })
    .set("Authorization", `Bearer ${agentToken}`);
  assert.equal(historyPage2.status, 200);
  assert.equal(historyPage2.body.items.length, 1);
  assert.notEqual(historyPage1.body.items[0].id, historyPage2.body.items[0].id);
  assert.ok([order.id, secondOrder.id].includes(historyPage2.body.items[0].id));
  assert.match(historyPage2.headers["server-timing"], /order-history;dur=/);
});
