const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");
process.env.JWT_ACCESS_SECRET ||= "behavior-test-secret";
const { signAccessToken, errorHandler } = require("@reloop/shared");
const {
  createBehaviorRepository,
  recencyWeight,
} = require("./behaviorRepository");
const { createRecommendationService } = require("./recommendationService");
const { createRecommendationRoutes } = require("./recommendationRoutes");
const { createPurchaseHistoryClient } = require("./purchaseHistoryClient");

test("recent behavior outweighs old interests; stale or invalid dates are ignored", () => {
  const now = Date.now();
  const ago = (days) => new Date(now - days * 86400000);
  assert.equal(recencyWeight(ago(1), 8, now), 8);
  assert.equal(recencyWeight(ago(20), 8, now), 4);
  assert.equal(recencyWeight(ago(80), 8, now), 2);
  assert.equal(recencyWeight(ago(181), 8, now), 0);
  assert.equal(recencyWeight("bad date", 8, now), 0);
});

test("searches are normalized, deduplicated and bounded per authenticated account", async () => {
  const calls = [];
  const tx = {
    recommendationSearch: {
      async upsert(args) {
        calls.push(args);
      },
      async findMany(args) {
        assert.equal(args.where.userId, "buyer");
        assert.equal(args.take, 50);
        return [{ query: "nike" }];
      },
      async deleteMany(args) {
        assert.equal(args.where.userId, "buyer");
        assert.deepEqual(args.where.query.notIn, ["nike"]);
      },
    },
  };
  const repo = createBehaviorRepository({ $transaction: async (fn) => fn(tx) });
  await repo.recordSearch("buyer", " Nike ");
  assert.deepEqual(calls[0].where.userId_query, {
    userId: "buyer",
    query: "nike",
  });
  for (const query of [null, "", "x".repeat(201), "abc\n"])
    await assert.rejects(repo.recordSearch("buyer", query));
  assert.equal(calls.length, 1);
});

test("likes load from live choices scoped to the viewer and purchase signals skip deleted products", async () => {
  const product = {
    id: "bought",
    category: "Shoes",
    brand: "Nike",
    tags: ["sport"],
    categoryLinks: [{ category: { name: "Running" } }],
  };
  const repo = createBehaviorRepository({
    recommendationView: { findMany: async () => [] },
    recommendationSearch: {
      findMany: async ({ where }) => {
        assert.equal(where.userId, "buyer");
        return [];
      },
    },
    swipeChoice: {
      findMany: async ({ where }) => {
        assert.equal(where.userId, "buyer");
        assert.equal(where.productVideo.product.moderatedAt, null);
        return [{ createdAt: new Date(), productVideo: { product } }];
      },
    },
    product: {
      findMany: async ({ where }) => {
        assert.equal(where.moderatedAt, null);
        return [product];
      },
    },
  });
  const behavior = await repo.get("buyer");
  assert.deepEqual(behavior.likes[0].profile.categories, ["shoes", "running"]);
  assert.deepEqual(behavior.likes[0].profile.sizes, []);
  const purchases = await repo.purchases([
    { productId: "bought", purchasedAt: new Date() },
    { productId: "deleted", purchasedAt: new Date() },
  ]);
  assert.equal(purchases.length, 1);
  assert.equal(purchases[0].weight, 10);
});

test("behavior personalizes without a Style Profile and survives a partial provider outage", async () => {
  let args;
  const service = createRecommendationService({
    profiles: {
      get: async () => {
        throw new Error("Auth profile down");
      },
    },
    purchases: {
      get: async () => {
        throw new Error("Order down");
      },
    },
    behaviors: {
      get: async () => ({
        searches: [{ query: "shoes", weight: 6 }],
        likes: [],
      }),
    },
    products: {
      list: async (input) => {
        args = input;
        return { items: [], matchedTotal: 1, total: 1 };
      },
    },
  });
  const result = await service.list({
    userId: "buyer",
    roles: ["BUYER"],
    authorization: "Bearer fixture",
    filters: { brand: "Nike" },
    take: 12,
    skip: 0,
  });
  assert.equal(result.personalized, true);
  assert.equal(result.fallbackReason, null);
  assert.deepEqual(result.unavailableSources, ["profile", "purchases"]);
  assert.equal(args.behavior.searches[0].query, "shoes");
  assert.equal(args.filters.brand, "Nike");
});

test("view events validate seeds and deduplicate per account, product and source", async () => {
  const writes = [];
  const product = { id: "p" };
  const viewStore = {
    upsert: async (args) => writes.push(args),
    findMany: async ({ where, take }) => {
      assert.equal(where.userId, "buyer");
      assert.equal(take, 50);
      assert.ok(where.viewedAt.gte instanceof Date);
      return [{ productId: "p" }];
    },
    deleteMany: async ({ where }) => {
      assert.equal(where.userId, "buyer");
      assert.deepEqual(where.productId.notIn, ["p"]);
    },
  };
  const repo = createBehaviorRepository({
    product: {
      findFirst: async ({ where }) => {
        assert.equal(where.moderatedAt, null);
        assert.equal(where.status, "available");
        assert.deepEqual(where.sellerId, { not: "buyer" });
        return where.id === "p" ? product : null;
      },
    },
    productVideo: {
      findFirst: async ({ where }) => {
        assert.equal(where.deletedAt, null);
        assert.equal(where.product.status, "available");
        return where.id === "v" ? { product } : null;
      },
    },
    $transaction: async (fn) => fn({ recommendationView: viewStore }),
  });
  await repo.recordView("buyer", {
    source: "product",
    productId: "p",
    userId: "victim",
  });
  await repo.recordView("buyer", { source: "product", productId: "p" });
  await repo.recordView("buyer", { source: "video", videoId: "v" });
  assert.deepEqual(writes[0].where, writes[1].where);
  assert.deepEqual(writes[2].create, {
    userId: "buyer",
    productId: "p",
    source: "video",
  });
  assert.ok(writes[1].update.viewedAt instanceof Date);
  for (const input of [
    null,
    {},
    { source: "other", productId: "p" },
    { source: "product", productId: "" },
    { source: "video", videoId: 42 },
    { source: "product", productId: "gone" },
    { source: "video", videoId: "gone" },
  ]) {
    await assert.rejects(repo.recordView("buyer", input));
  }
  assert.equal(writes.length, 3);
});

test("view signals use independent caps, account filters and recency with search's new default", async () => {
  const product = { category: "Shoes", brand: "Nike", tags: ["sport"] };
  const repo = createBehaviorRepository({
    recommendationSearch: {
      findMany: async () => [{ query: "nike", searchedAt: new Date() }],
    },
    swipeChoice: { findMany: async () => [] },
    recommendationView: {
      findMany: async ({ where, take }) => {
        assert.equal(where.userId, "buyer");
        assert.equal(where.product.deletedAt, null);
        assert.equal(where.product.moderatedAt, null);
        assert.equal(take, 100);
        return [
          { source: "product", product, viewedAt: new Date() },
          {
            source: "video",
            product,
            viewedAt: new Date(Date.now() - 20 * 86400000),
          },
        ];
      },
    },
  });
  const behavior = await repo.get("buyer");
  assert.equal(behavior.searches[0].weight, 3);
  assert.equal(behavior.productViews[0].weight, 5);
  assert.equal(behavior.videoViews[0].weight, 2.5);
  assert.deepEqual(behavior.productViews[0].profile.brands, ["nike"]);
});

test("view event API restricts writes to the authenticated customer", async () => {
  const calls = [];
  const app = express();
  app.use(express.json());
  app.locals.validateAccessSession = async () => ({});
  app.use(
    createRecommendationRoutes(
      {},
      {
        recordView: async (userId, input) => calls.push({ userId, input }),
      },
    ),
  );
  app.use(errorHandler);
  const body = { source: "video", videoId: "v", userId: "victim" };
  assert.equal(
    (await request(app).post("/view-events").send(body)).status,
    401,
  );
  for (const role of ["ADMIN", "BUYER"]) {
    const response = await request(app)
      .post("/view-events")
      .set("Authorization", `Bearer ${signAccessToken({ sub: "buyer", role })}`)
      .send(body);
    assert.equal(response.status, role === "ADMIN" ? 403 : 204);
    if (role === "BUYER")
      assert.equal(response.headers["cache-control"], "private, no-store");
  }
  assert.deepEqual(calls, [{ userId: "buyer", input: body }]);
});

test("search event API prevents guest/staff writes and ignores spoofed owner", async () => {
  const calls = [];
  const app = express();
  app.use(express.json());
  app.locals.validateAccessSession = async () => ({});
  app.use(
    createRecommendationRoutes(
      { list: async () => ({ items: [], total: 0 }) },
      {
        recordSearch: async (userId, query) => {
          calls.push({ userId, query });
        },
      },
    ),
  );
  app.use(errorHandler);
  assert.equal(
    (await request(app).post("/search-events").send({ query: "shoes" })).status,
    401,
  );
  const staff = signAccessToken({ sub: "staff", role: "ADMIN" });
  assert.equal(
    (
      await request(app)
        .post("/search-events")
        .set("Authorization", `Bearer ${staff}`)
        .send({ query: "shoes" })
    ).status,
    403,
  );
  const buyer = signAccessToken({ sub: "buyer", role: "BUYER" });
  assert.equal(
    (
      await request(app)
        .post("/search-events")
        .set("Authorization", `Bearer ${buyer}`)
        .send({ query: "shoes", userId: "victim" })
    ).status,
    204,
  );
  assert.deepEqual(calls, [{ userId: "buyer", query: "shoes" }]);
  const invalid = await request(app).get("/?minPrice=100&maxPrice=10");
  assert.equal(invalid.status, 400);
  assert.equal((await request(app).get("/?seed=invalid%20seed")).status, 400);
  assert.equal(
    (await request(app).get("/?seed=" + "x".repeat(65))).status,
    400,
  );
});

test("purchase client passes bearer token only to Order and rejects unusable responses", async () => {
  const client = createPurchaseHistoryClient({
    baseUrl: "http://order.test",
    fetchImpl: async (url, options) => {
      assert.equal(url.pathname, "/recommendation-history");
      assert.equal(options.headers.authorization, "Bearer fixture");
      return {
        ok: true,
        json: async () => ({
          items: [{ productId: "p", purchasedAt: new Date() }],
        }),
      };
    },
  });
  assert.equal((await client.get("Bearer fixture"))[0].productId, "p");
  await assert.rejects(
    createPurchaseHistoryClient({
      baseUrl: "http://order.test",
      fetchImpl: async () => ({ ok: false, status: 503 }),
    }).get("Bearer fixture"),
  );
});
