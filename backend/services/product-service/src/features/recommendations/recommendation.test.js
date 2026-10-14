const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");
process.env.JWT_ACCESS_SECRET ||= "recommendation-test-secret";
const { signAccessToken } = require("@reloop/shared");
const { normalizeProfile, explanation } = require("./recommendationRules");
const { createRecommendationService } = require("./recommendationService");
const { createRecommendationRoutes } = require("./recommendationRoutes");
const { createStyleProfileClient } = require("./styleProfileClient");
const {
  createRecommendationRepository,
} = require("./recommendationRepository");

test("normalizes multi-value preferences and keeps size category boundaries", () => {
  assert.deepEqual(
    normalizeProfile({
      categories: [" Shoes ", "shoes"],
      brands: [" NIKE "],
      styles: [" Vintage "],
      sizes: [{ category: " Shoes ", values: [" 40 ", "40"] }],
      unassignedSizes: ["M"],
    }),
    {
      categories: ["shoes"],
      brands: ["nike"],
      styles: ["vintage"],
      sizes: [{ category: "shoes", values: ["40"] }],
    },
  );
  assert.equal(explanation({ category: true, size: true }).score, 9);
  assert.equal(
    explanation({ category: true, style: true, brand: true, size: true }).score,
    14,
  );
});

for (const scenario of [
  { name: "guest", args: {}, expected: "guest", calls: 0 },
  {
    name: "empty profile",
    profile: {},
    args: { userId: "buyer", roles: ["BUYER"] },
    expected: "no-profile",
    calls: 1,
  },
  {
    name: "legacy unassigned sizes",
    profile: { unassignedSizes: ["M"] },
    args: { userId: "buyer", roles: ["BUYER"] },
    expected: "no-profile",
    calls: 1,
  },
  {
    name: "auth profile outage",
    error: true,
    args: { userId: "buyer", roles: ["BUYER"] },
    expected: "profile-unavailable",
    calls: 1,
  },
  {
    name: "staff",
    args: { userId: "staff", roles: ["ADMIN"] },
    expected: "non-customer",
    calls: 0,
  },
  {
    name: "no matching products",
    profile: { brands: ["Nike"] },
    args: { userId: "buyer", roles: ["BUYER"] },
    matches: 0,
    expected: "no-matches",
    calls: 1,
  },
  {
    name: "buyer with matches",
    profile: { brands: ["Nike"] },
    args: { userId: "buyer", roles: ["BUYER"] },
    matches: 2,
    expected: null,
    calls: 1,
  },
  {
    name: "dual-role customer",
    profile: { styles: ["vintage"] },
    args: { userId: "seller", roles: ["BUYER", "SELLER"] },
    matches: 1,
    expected: null,
    calls: 1,
  },
]) {
  test(`labelled recommendation fallback: ${scenario.name}`, async () => {
    let calls = 0;
    let query;
    const service = createRecommendationService({
      behaviors: { get: async () => ({}), purchases: async () => [] },
      purchases: { get: async () => [] },
      profiles: {
        async get(token) {
          calls++;
          assert.equal(token, "Bearer fixture");
          if (scenario.error) throw new Error("offline");
          return scenario.profile;
        },
      },
      products: {
        async list(args) {
          query = args;
          return { items: [], total: 10, matchedTotal: scenario.matches || 0 };
        },
      },
    });
    const result = await service.list({
      ...scenario.args,
      authorization: "Bearer fixture",
      skip: 8,
      take: 8,
    });
    assert.equal(result.fallbackReason, scenario.expected);
    assert.equal(result.personalized, scenario.expected === null);
    assert.equal(calls, scenario.calls);
    assert.equal(query.userId, scenario.args.userId);
    assert.equal(query.skip, 8);
  });
}

test("profile HTTP client forwards bearer identity with timeout to Auth's own endpoint", async () => {
  const client = createStyleProfileClient({
    baseUrl: "http://auth.test:3001",
    async fetchImpl(url, options) {
      assert.equal(url.pathname, "/me/style-profile");
      assert.equal(options.headers.authorization, "Bearer fixture");
      assert.ok(options.signal instanceof AbortSignal);
      return { ok: true, json: async () => normalizeProfile() };
    },
  });
  assert.deepEqual(await client.get("Bearer fixture"), normalizeProfile());
});

test("profile HTTP client rejects upstream errors and malformed responses", async () => {
  for (const response of [
    { ok: false, status: 503 },
    { ok: true, json: async () => ({}) },
  ]) {
    await assert.rejects(
      createStyleProfileClient({
        baseUrl: "http://auth.test",
        fetchImpl: async () => response,
      }).get("Bearer fixture"),
    );
  }
});

test("repository parameterizes preferences, ranks before paging and rechecks live eligibility", async () => {
  const queries = [];
  let hydration;
  const db = {
    async $queryRaw(query) {
      queries.push(query);
      return queries.length === 1
        ? [
            { id: "gone", category: true },
            { id: "match", category: true, size: true },
          ]
        : [{ total: 2, matched_total: 2 }];
    },
    product: {
      async findMany(query) {
        hydration = query;
        return [
          { id: "match", tags: [], photos: [], videos: [], categoryLinks: [] },
        ];
      },
    },
  };
  const injection = "Nike'); DROP TABLE products; --";
  const result = await createRecommendationRepository(db).list({
    profile: normalizeProfile({
      brands: [injection],
      sizes: [{ category: "shoes", values: ["40"] }],
    }),
    userId: "buyer",
    skip: 8,
    take: 8,
  });
  assert.ok(!queries[0].text.includes(injection));
  assert.ok(queries[0].values.includes(injection.toLowerCase()));
  assert.match(
    queries[0].text,
    /ORDER BY\s+score DESC, products.created_at DESC, products.id ASC LIMIT/,
  );
  assert.match(queries[0].text, /status = \$\d+ AND moderated_at IS NULL/);
  assert.deepEqual(hydration.where.sellerId, { not: "buyer" });
  assert.equal(hydration.where.status, "available");
  assert.equal(hydration.where.moderatedAt, null);
  assert.deepEqual(
    result.items.map((item) => item.id),
    ["match"],
  );
  assert.equal(result.items[0].recommendation.score, 9);
});

function api(service) {
  const app = express();
  app.locals.validateAccessSession = async () => ({});
  app.use("/recommendations", createRecommendationRoutes(service));
  return app;
}

test("public API ignores spoofed user headers and query IDs, clamps pagination, prevents caching", async () => {
  let args;
  const res = await request(
    api({
      async list(input) {
        args = input;
        return {
          items: [],
          total: 0,
          matchedTotal: 0,
          personalized: false,
          fallbackReason: "guest",
        };
      },
    }),
  )
    .get("/recommendations?userId=victim&limit=999&page=2")
    .set("x-user-id", "victim");
  assert.equal(res.status, 200);
  assert.equal(args.userId, null);
  assert.equal(args.take, 50);
  assert.equal(args.skip, 50);
  assert.equal(res.headers["cache-control"], "private, no-store");
});

test("API uses signed account identity and rejects invalid tokens", async () => {
  let args;
  const app = api({
    async list(input) {
      args = input;
      return { items: [], total: 0 };
    },
  });
  const token = signAccessToken({ sub: "buyer", role: "BUYER" });
  const res = await request(app)
    .get("/recommendations?userId=victim")
    .set("Authorization", `Bearer ${token}`);
  assert.equal(res.status, 200);
  assert.equal(args.userId, "buyer");
  assert.deepEqual(args.roles, ["BUYER"]);
  assert.equal(
    (
      await request(app)
        .get("/recommendations")
        .set("Authorization", "Bearer invalid")
    ).status,
    401,
  );
});
