const test = require("node:test");
const assert = require("node:assert/strict");
const service = require("./interestAudienceService");

function dependencies(now) {
  return {
    authClient: {
      listBuyerProfiles: async () => [
        { userId: "buyer-a", profile: { brands: ["Nike"] } },
        { userId: "buyer-b", profile: {} },
        { userId: "buyer-c", profile: {} },
      ],
    },
    orderClient: {
      listPurchases: async () => [
        { userId: "buyer-a", productId: "product-nike", purchasedAt: now },
      ],
    },
    repository: {
      listSearchSignals: async () => [
        { userId: "buyer-a", query: "nike", searchedAt: now },
        { userId: "buyer-b", query: "nike", searchedAt: now },
      ],
      listLikeSignals: async () => [
        {
          userId: "buyer-a",
          occurredAt: now,
          profile: { brands: ["Nike"] },
        },
      ],
      hydratePurchaseSignals: async (purchases) =>
        purchases.map((purchase) => ({
          userId: purchase.userId,
          occurredAt: purchase.purchasedAt,
          profile: { brands: ["Nike"] },
        })),
      listDimensions: async () => ({
        categories: ["รองเท้า"],
        brands: ["Nike"],
        styles: ["Running"],
        sizes: ["42"],
      }),
    },
  };
}

test("audience preview reports the agreed bands and only returns aggregate data", async () => {
  const now = new Date("2026-10-18T08:00:00.000Z");
  const result = await service.preview(
    {
      brand: "Nike",
      minScore: 15,
      maxScore: 30,
      from: "2026-10-01T00:00:00.000Z",
      to: now.toISOString(),
    },
    dependencies(now),
  );

  assert.equal(result.totalCustomers, 3);
  assert.equal(result.interestedCustomers, 2);
  assert.equal(result.eligibleCustomers, 1);
  assert.equal(result.maximumObserved, 23);
  assert.equal(result.averageScore, 13);
  assert.equal(result.maximumPossible, 23);
  assert.equal(result.globalMaximum, 30);
  assert.deepEqual(
    result.distribution.map(({ min, max, count }) => [min, max, count]),
    [[0, 0, 1], [1, 6, 1], [7, 14, 0], [15, 24, 1], [25, 30, 0]],
  );
  assert.equal(Object.hasOwn(result, "eligible"), false);
  assert.equal(JSON.stringify(result).includes("buyer-a"), false);
});

test("audience snapshot freezes only users inside the selected score range", async () => {
  const now = new Date("2026-10-18T08:00:00.000Z");
  const result = await service.snapshot(
    {
      brand: "Nike",
      minScore: 15,
      maxScore: 30,
      from: "2026-10-01T00:00:00.000Z",
      to: now.toISOString(),
    },
    dependencies(now),
  );

  assert.deepEqual(result.members, [{ userId: "buyer-a", score: 23 }]);
  assert.equal(result.eligibleCustomers, 1);
});

test("audience options expose only marketing interest dimensions", async () => {
  const result = await service.options({
    repository: {
      listDimensions: async () => ({
        categories: ["รองเท้า"],
        brands: ["Nike"],
        styles: ["Running"],
        sizes: ["42"],
        sizesByCategory: { รองเท้า: ["42"] },
      }),
    },
  });

  assert.deepEqual(result.dimensions, {
    categories: ["รองเท้า"],
    brands: ["Nike"],
    styles: ["Running"],
  });
  assert.equal(result.globalMaximum, 30);
});

test("unfiltered trend aggregates every behavior dimension and reports source coverage", async () => {
  const now = new Date("2026-10-18T08:00:00.000Z");
  const result = await service.insights(
    {
      signal: "all",
      from: "2026-10-01T00:00:00.000Z",
      to: now.toISOString(),
    },
    dependencies(now),
  );

  assert.deepEqual(result.behaviorSummary, {
    search: 2,
    like: 1,
    purchase: 1,
  });
  assert.equal(result.trend.at(-1).interestedCustomers, 2);
  assert.equal(result.trend.at(-1).search, 2);
  assert.equal(result.trend.at(-1).like, 1);
  assert.equal(result.trend.at(-1).purchase, 1);
});

test("multi-dimension targeting requires every selected interest", () => {
  const rows = service.scoreDataset(
    [
      {
        userId: "bag-only",
        profile: { categories: ["กระเป๋า"] },
        behavior: {},
      },
      {
        userId: "nike-only",
        profile: { brands: ["Nike"] },
        behavior: {},
      },
      {
        userId: "bag-and-nike",
        profile: { categories: ["กระเป๋า"], brands: ["Nike"] },
        behavior: {},
      },
    ],
    { category: "กระเป๋า", brand: "Nike" },
  );

  assert.deepEqual(
    rows.filter((row) => row.score > 0).map((row) => row.userId),
    ["bag-and-nike"],
  );
});

test("filtered insights require a signal from the ranked dimension", async () => {
  const now = new Date("2026-10-18T08:00:00.000Z");
  const testDependencies = dependencies(now);
  testDependencies.authClient.listBuyerProfiles = async () => [
    { userId: "buyer-a", profile: { categories: ["กระเป๋า"] } },
    {
      userId: "buyer-b",
      profile: {
        categories: ["รองเท้า"],
        brands: ["Adidas"],
        styles: ["501"],
      },
    },
  ];
  testDependencies.orderClient.listPurchases = async () => [];
  testDependencies.repository.listSearchSignals = async () => [];
  testDependencies.repository.listLikeSignals = async () => [];
  testDependencies.repository.hydratePurchaseSignals = async () => [];
  testDependencies.repository.listDimensions = async () => ({
    categories: ["กระเป๋า"],
    brands: ["Adidas"],
    styles: ["501"],
    sizes: [],
  });

  const result = await service.insights(
    {
      signal: "profile",
      category: "กระเป๋า",
      from: "2026-10-01T00:00:00.000Z",
      to: now.toISOString(),
    },
    testDependencies,
  );

  assert.equal(result.topCategory.value, "กระเป๋า");
  assert.equal(result.topCategory.interestedCustomers, 1);
  assert.equal(result.topBrand, null);
  assert.equal(result.topStyle, null);
  assert.deepEqual(
    result.categoryRanking.map(({ value, interestedCustomers }) => ({
      value,
      interestedCustomers,
    })),
    [{ value: "กระเป๋า", interestedCustomers: 1 }],
  );
  assert.deepEqual(
    result.brandRanking.map(({ value, interestedCustomers }) => ({
      value,
      interestedCustomers,
    })),
    [{ value: "Adidas", interestedCustomers: 0 }],
  );
  assert.deepEqual(result.rankings.category, result.categoryRanking);
  assert.deepEqual(result.rankings.brand, result.brandRanking);
  assert.equal(result.rankings.style[0].value, "501");
  assert.equal(Object.hasOwn(result.rankings, "size"), false);

  const combinedResult = await service.insights(
    {
      signal: "profile",
      category: "กระเป๋า",
      brand: "Adidas",
      from: "2026-10-01T00:00:00.000Z",
      to: now.toISOString(),
    },
    testDependencies,
  );
  assert.equal(combinedResult.interestedCustomers, 0);
  assert.equal(combinedResult.selected.interestedCustomers, 0);
});
