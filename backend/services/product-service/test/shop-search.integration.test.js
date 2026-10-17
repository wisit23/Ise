const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const express = require("express");
const request = require("supertest");
process.env.INTERNAL_SERVICE_TOKEN ||= "shop-integration-token";
process.env.JWT_ACCESS_SECRET ||= "shop-integration-secret";
// Auth owns the default client; product has its own generated client and URL.
if (process.env.DATABASE_URL_AUTH) process.env.DATABASE_URL = process.env.DATABASE_URL_AUTH;
const auth = require("../../auth-service/src/models/prismaClient");
const products = require("../src/models/prismaClient");
const { errorHandler } = require("@reloop/shared");
const authRoutes = require("../../auth-service/src/features/internal/internalRoutes");
const productApp = require("../src/app");

test("shop names find products through catalog and recommendations with real auth/PostgreSQL", async (t) => {
  if (!process.env.DATABASE_URL_AUTH || !process.env.DATABASE_URL_PRODUCT) {
    if (process.env.REQUIRE_INTEGRATION === "1") throw new Error("Auth and product test database URLs required");
    t.skip("Set DATABASE_URL_AUTH and DATABASE_URL_PRODUCT");
    return;
  }
  const authApp = express();
  authApp.use(express.json());
  authApp.use("/internal", authRoutes);
  authApp.use(errorHandler);
  const server = authApp.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.on("listening", resolve));
  const oldUrl = process.env.AUTH_SERVICE_INTERNAL_URL;
  process.env.AUTH_SERVICE_INTERNAL_URL = `http://127.0.0.1:${server.address().port}`;
  const key = randomUUID();
  // Do not share the isolation token with product text: trigram search would
  // legitimately match that token instead of proving a shop-only match.
  const shopKey = randomUUID();
  const shopName = `ร้านดาบ-${shopKey}`;
  const sellerIds = [];
  const productIds = [];
  t.after(async () => {
    if (oldUrl === undefined) delete process.env.AUTH_SERVICE_INTERNAL_URL;
    else process.env.AUTH_SERVICE_INTERNAL_URL = oldUrl;
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    await products.product.deleteMany({ where: { id: { in: productIds } } });
    // The product-category trigger creates a separate lookup row, not just links.
    await products.category.deleteMany({ where: { name: key, products: { none: {} } } });
    await products.condition.deleteMany({ where: { value: key, products: { none: {} } } });
    assert.equal(await products.category.count({ where: { name: key } }), 0);
    assert.equal(await products.condition.count({ where: { value: key } }), 0);
    await auth.sellerProfile.deleteMany({ where: { userId: { in: sellerIds } } });
    await auth.user.deleteMany({ where: { id: { in: sellerIds } } });
    await Promise.all([auth.$disconnect(), products.$disconnect()]);
  });
  async function seller(name, status = "ACTIVE") {
    const user = await auth.user.create({ data: {
      email: `${randomUUID()}@shop-search.test`, passwordHash: "test-only", firstName: "Test", lastName: "Private",
      role: "SELLER", status, sellerProfile: { create: { shopName: name } },
    } });
    sellerIds.push(user.id);
    return user.id;
  }
  const owner = await seller(shopName);
  const otherOwner = await seller(`other-${key}`);
  const suspendedOwner = await seller(shopName, "SUSPENDED");
  await products.condition.create({ data: { value: key, label: "Test" } });
  async function product(sellerId, fields = {}) {
    const row = await products.product.create({ data: {
      sellerId, title: "โมเดลซามูไร", category: key, condition: key, price: 100, brand: key, ...fields,
    } });
    productIds.push(row.id);
    return row;
  }
  const first = await product(owner);
  const second = await product(owner, { price: 150 });
  await product(otherOwner);
  await product(suspendedOwner);
  await product(owner, { status: "sold" });
  await product(owner, { status: "reserved" });
  await product(owner, { status: "removed" });
  await product(owner, { moderatedAt: new Date() });
  const keyword = await product(otherOwner, { title: `keyword-${key}` });

  for (const endpoint of ["/search", "/recommendations"]) {
    await t.test(endpoint, async () => {
      const search = (query) => request(productApp).get(endpoint).query({ brand: key, ...query });
      const response = await search({ q: shopName });
      assert.equal(response.status, 200);
      assert.equal(response.body.total, 2);
      assert.deepEqual(response.body.items.map((p) => p.id).sort(), [first.id, second.id].sort());
      assert.ok(!JSON.stringify(response.body).includes("Private"));
      const partial = await search({ q: `ดาบ-${shopKey}` });
      assert.equal(partial.body.total, 2);
      const filtered = await search({ q: shopName, maxPrice: 120 });
      assert.deepEqual(filtered.body.items.map((p) => p.id), [first.id]);
      const p1 = await search({ q: shopName, limit: 1, page: 1 });
      const p2 = await search({ q: shopName, limit: 1, page: 2 });
      assert.equal(p1.body.total, 2);
      assert.equal(p2.body.total, 2);
      assert.notEqual(p1.body.items[0].id, p2.body.items[0].id);
      const noMatch = await search({ q: `zzzzzzzz${randomUUID()}` });
      assert.equal(noMatch.body.total, 0);
      const byKeyword = await search({ q: keyword.title });
      assert.ok(byKeyword.body.items.some((p) => p.id === keyword.id));
    });
  }
  // Shop edits are reflected immediately; no product rewrite or cache is needed.
  const newShopName = `NewShop-${randomUUID()}`;
  await auth.sellerProfile.update({ where: { userId: owner }, data: { shopName: newShopName } });
  const renamed = await request(productApp).get("/search").query({ q: newShopName.toLowerCase(), brand: key });
  assert.equal(renamed.body.total, 2);
  const oldName = await request(productApp).get("/search").query({ q: shopName, brand: key });
  assert.equal(oldName.body.total, 0);
  await new Promise((resolve) => server.close(resolve));
  for (const endpoint of ["/search", "/recommendations"]) {
    const fallback = await request(productApp).get(endpoint).query({ q: keyword.title, brand: key });
    assert.equal(fallback.status, 200);
    assert.ok(fallback.body.items.some((p) => p.id === keyword.id));
    if (endpoint === "/recommendations") assert.ok(fallback.body.unavailableSources.includes("shops"));
  }
});
