// Run with DATABASE_URL_PRODUCT pointed at a test database. Every fixture is
// inside a transaction that always rolls back, including assertion failures.
const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const prisma = require("../../models/prismaClient");
const {
  createRecommendationRepository,
} = require("./recommendationRepository");
const {
  normalizeProfile,
  weightFor,
  repeatCapFor,
} = require("./recommendationRules");
const { createBehaviorRepository } = require("./behaviorRepository");

test("configured weights change PostgreSQL ranking and response explanations together", async (t) => {
  if (!process.env.DATABASE_URL_PRODUCT && !process.env.DATABASE_URL) {
    if (process.env.REQUIRE_INTEGRATION === "1")
      throw new Error("Test database URL required");
    t.skip("Set DATABASE_URL_PRODUCT to run PostgreSQL verification");
    return;
  }
  const rollback = new Error("rollback configured weight fixtures");
  try {
    await prisma.$transaction(
      async (tx) => {
        const key = randomUUID();
        const condition = `weights-${key}`;
        await tx.condition.create({
          data: { value: condition, label: "Test" },
        });
        const make = (fields) =>
          tx.product.create({
            data: {
              sellerId: `seller-${key}`,
              title: "Weight fixture",
              price: 100,
              category: `other-${key}`,
              tags: [],
              condition,
              ...fields,
            },
          });
        const searchProduct = await make({ title: `search${key}` });
        const viewProduct = await make({
          category: `view-${key}`,
          brand: `brand-${key}`,
          tags: [`style-${key}`],
        });
        const buyer = `weights-buyer-${key}`;
        // Already inside the rollback transaction; Prisma does not nest transactions.
        const behaviors = createBehaviorRepository({
          ...tx,
          $transaction: async (fn) => fn(tx),
        });
        await behaviors.recordSearch(buyer, `search${key}`);
        await behaviors.recordView(buyer, {
          source: "product",
          productId: viewProduct.id,
        });
        const clip = await tx.productVideo.create({
          data: {
            productId: viewProduct.id,
            sellerId: viewProduct.sellerId,
            videoUrl: "/test.mp4",
          },
        });
        await behaviors.recordView(buyer, {
          source: "video",
          videoId: clip.id,
        });
        const repo = createRecommendationRepository(tx);
        const result = await repo.list({
          userId: buyer,
          profile: normalizeProfile(),
          behavior: await behaviors.get(buyer),
          skip: 0,
          take: 50,
        });
        const relevant = result.items.filter((item) =>
          [searchProduct.id, viewProduct.id].includes(item.id),
        );
        const expected = [
          { id: searchProduct.id, score: weightFor("search") },
          {
            id: viewProduct.id,
            score: weightFor("productView") + weightFor("videoView"),
          },
        ].sort((a, b) => b.score - a.score);
        assert.deepEqual(
          relevant.map((item) => ({
            id: item.id,
            score: item.recommendation.score,
          })),
          expected,
        );
        const views = relevant.find((item) => item.id === viewProduct.id);
        assert.equal(
          views.recommendation.reasons.length,
          Number(weightFor("productView") > 0) +
            Number(weightFor("videoView") > 0),
        );
        throw rollback;
      },
      { timeout: 30000 },
    );
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    await prisma.$disconnect();
  }
});

test("PostgreSQL ranking: category memberships, category-specific sizes, eligibility and deterministic paging", async (t) => {
  if (!process.env.DATABASE_URL_PRODUCT && !process.env.DATABASE_URL) {
    if (process.env.REQUIRE_INTEGRATION === "1")
      throw new Error("Test database URL required");
    t.skip("Set DATABASE_URL_PRODUCT to run PostgreSQL verification");
    return;
  }
  const rollback = new Error("rollback recommendation fixtures");
  try {
    await prisma.$transaction(
      async (tx) => {
        const key = randomUUID();
        const category = `rec-category-${key}`;
        const brand = `rec-brand-${key}`;
        const style = `rec-style-${key}`;
        const buyer = `rec-buyer-${key}`;
        const condition = `rec-condition-${key}`;
        const membership = await tx.category.create({
          data: { name: category },
        });
        await tx.condition.create({
          data: { value: condition, label: "Test" },
        });
        const create = async (fields = {}) =>
          tx.product.create({
            data: {
              title: "Recommendation rollback fixture",
              sellerId: `rec-seller-${key}`,
              category,
              brand,
              tags: [style],
              size: "M",
              price: 100,
              condition,
              createdAt: new Date("2000-01-01"),
              ...fields,
            },
          });
        const older = await create();
        const tie = await create();
        const multiCategory = await create({
          category: "other",
          createdAt: new Date("2001-01-01"),
          categoryLinks: { create: { categoryId: membership.id } },
        });
        const wrongCategory = await create({
          category: "other",
          brand: "",
          tags: [],
          createdAt: new Date("2002-01-01"),
        });
        const wrongSize = await create({
          size: "40",
          createdAt: new Date("2002-01-01"),
        });
        const exactSearch = await create({
          category: "other",
          brand: "Nike",
          tags: [],
          title: "Nike test shoe",
        });
        const misleadingWord = await create({
          category: "other",
          brand: "",
          tags: [],
          title: "Like new unrelated item",
        });
        const excluded = [];
        for (const status of [
          "sold",
          "reserved",
          "removed",
          "hidden",
          "auction",
          "auction_action_required",
        ]) {
          excluded.push((await create({ status })).id);
        }
        excluded.push((await create({ moderatedAt: new Date() })).id);
        excluded.push((await create({ sellerId: buyer })).id);
        const repo = createRecommendationRepository(tx);
        // Score and pool assertions need the whole catalog, including old
        // zero-score fixtures that can fall beyond the first page after seeding.
        const args = {
          userId: buyer,
          skip: 0,
          take: await tx.product.count(),
          profile: normalizeProfile({
            categories: [category],
            brands: [brand.toUpperCase()],
            styles: [style],
            sizes: [{ category, values: ["M"] }],
          }),
        };
        const first = await repo.list(args);
        assert.equal(first.items.length, first.total);
        assert.deepEqual(
          first.items.slice(0, 3).map((item) => item.id),
          [multiCategory.id, ...[older.id, tie.id].sort()],
        );
        assert.deepEqual(
          first.items.slice(0, 3).map((item) => item.recommendation.score),
          [14, 14, 14],
        );
        assert.equal(
          first.items.find((item) => item.id === wrongSize.id).recommendation
            .score,
          9,
        );
        assert.equal(first.matchedTotal, 4);
        assert.ok(
          excluded.every((id) => !first.items.some((item) => item.id === id)),
        );
        const next = await repo.list({ ...args, skip: 1, take: 2 });
        assert.deepEqual(
          next.items.map((item) => item.id),
          first.items.slice(1, 3).map((item) => item.id),
        );
        // With a fixture-only size value, unrelated catalog rows cannot outrank
        // the matching rows; the same size in another category earns no points.
        const sizeOnly = await repo.list({
          ...args,
          profile: normalizeProfile({ sizes: [{ category, values: ["M"] }] }),
        });
        assert.equal(sizeOnly.matchedTotal, 3);
        // Check wrong-category score directly with the repository's SQL rules.
        const empty = await repo.list({
          ...args,
          profile: normalizeProfile(),
          take: 1,
        });
        assert.equal(empty.matchedTotal, 0);
        assert.equal(empty.items[0].recommendation.score, 0);
        assert.ok(wrongCategory.id);
        const activities = createBehaviorRepository({
          ...tx,
          $transaction: async (fn) => fn(tx),
        });
        await tx.recommendationSearch.create({
          data: { userId: buyer, query: brand.toLowerCase() },
        });
        const clip = await tx.productVideo.create({
          data: {
            productId: older.id,
            sellerId: older.sellerId,
            videoUrl: "/test.mp4",
          },
        });
        await tx.swipeChoice.create({
          data: { userId: buyer, productVideoId: clip.id },
        });
        const behavior = await activities.get(buyer);
        behavior.purchases = await activities.purchases([
          { productId: older.id, purchasedAt: new Date() },
        ]);
        const inferred = await repo.list({
          ...args,
          profile: normalizeProfile(),
          behavior,
        });
        assert.equal(inferred.items[0].recommendation.score, 21);
        assert.equal(inferred.items[0].recommendation.reasons.length, 3);
        await activities.recordView(buyer, {
          source: "product",
          productId: older.id,
        });
        await activities.recordView(buyer, {
          source: "product",
          productId: older.id,
        });
        await activities.recordView(buyer, {
          source: "video",
          videoId: clip.id,
        });
        assert.equal(
          await tx.recommendationView.count({ where: { userId: buyer } }),
          2,
        );
        const viewedBehavior = await activities.get(buyer);
        const viewed = await repo.list({
          ...args,
          profile: normalizeProfile(),
          behavior: viewedBehavior,
        });
        assert.equal(viewed.items[0].recommendation.score, 21); // search 3 + views 10 + heart 8
        assert.equal(viewed.items[0].recommendation.reasons.length, 4);
        await assert.rejects(
          activities.recordView(buyer, {
            source: "product",
            productId: excluded[0],
          }),
        );
        // Explicit filters remain hard constraints even for high-scoring items.
        const filtered = await repo.list({
          ...args,
          behavior,
          filters: { brand, minPrice: 100, maxPrice: 100 },
        });
        assert.ok(
          filtered.items.every(
            (item) => item.brand === brand && item.price === 100,
          ),
        );
        const noResults = await repo.list({
          ...args,
          behavior,
          filters: { minPrice: 101 },
        });
        // Existing catalog items may be pricier; our high-scoring fixtures cannot leak through.
        assert.ok(!noResults.items.some((item) => item.id === older.id));
        await tx.swipeChoice.deleteMany({ where: { userId: buyer } });
        const unliked = await activities.get(buyer);
        assert.equal(unliked.likes.length, 0);
        const ownSignals = await activities.get("another-buyer");
        assert.equal(ownSignals.searches.length, 0);
        assert.equal(ownSignals.likes.length, 0);
        assert.equal(ownSignals.productViews.length, 0);
        assert.equal(ownSignals.videoViews.length, 0);
        const literalSearch = await repo.list({
          ...args,
          profile: normalizeProfile(),
          behavior: {
            searches: [{ query: "nike", weight: 3 }],
          },
        });
        assert.equal(
          literalSearch.items.find((item) => item.id === exactSearch.id)
            .recommendation.score,
          3,
        );
        assert.equal(
          literalSearch.items.find((item) => item.id === misleadingWord.id)
            .recommendation.score,
          0,
        );
        const browse = await repo.list({
          ...args,
          seed: "browse-one",
        });
        const sameBrowse = await repo.list({
          ...args,
          seed: "browse-one",
        });
        assert.deepEqual(
          browse.items.slice(0, 4).map((item) => item.recommendation.bucket),
          ["personal", "new", "personal", "discovery"],
        );
        // Personal slots are a seeded weighted draw, not a strict score sort:
        // high scores come first far more often, yet order can vary by seed.
        const positions = { high: [], none: [] };
        let sawUnsorted = false;
        for (let run = 0; run < 30; run += 1) {
          const drawn = await repo.list({ ...args, seed: `weighted-${run}` });
          const personal = drawn.items.filter(
            (item) => item.recommendation.bucket === "personal",
          );
          const scores = personal.map((item) => item.recommendation.score);
          if (scores.some((score, i) => i > 0 && score > scores[i - 1]))
            sawUnsorted = true;
          personal.forEach((item, index) => {
            const score = item.recommendation.score;
            const position = index / personal.length;
            if (score >= 14) positions.high.push(position);
            else if (score === 0) positions.none.push(position);
          });
        }
        const mean = (values) =>
          values.reduce((sum, value) => sum + value, 0) / values.length;
        assert.ok(mean(positions.high) + 0.3 < mean(positions.none));
        assert.ok(sawUnsorted);
        assert.deepEqual(
          browse.items.map((item) => item.id),
          sameBrowse.items.map((item) => item.id),
        );
        const buckets = browse.items.reduce((counts, item) => {
          const bucket = item.recommendation.bucket;
          counts[bucket] = (counts[bucket] || 0) + 1;
          return counts;
        }, {});
        assert.equal(browse.items.length, browse.total);
        assert.equal(buckets.personal, Math.round(browse.total * 0.7));
        assert.equal(buckets.new, Math.round(browse.total * 0.15));
        assert.equal(
          buckets.discovery,
          browse.total - buckets.personal - buckets.new,
        );
        const pages = [];
        for (let skip = 0; skip < browse.total; skip += 12) {
          pages.push(
            ...(
              await repo.list({ ...args, seed: "browse-one", skip, take: 12 })
            ).items,
          );
        }
        assert.equal(new Set(pages.map((item) => item.id)).size, browse.total);
        assert.deepEqual(
          pages.map((item) => item.id),
          browse.items.map((item) => item.id),
        );
        const refreshed = await repo.list({
          ...args,
          seed: "browse-two",
        });
        assert.notDeepEqual(
          refreshed.items.map((item) => item.id),
          browse.items.map((item) => item.id),
        );
        assert.ok(refreshed.items.every((item) => !excluded.includes(item.id)));
        const narrow = await repo.list({
          ...args,
          seed: "browse-one",
          filters: { brand, maxPrice: 100 },
        });
        assert.ok(
          narrow.items.every(
            (item) => item.brand === brand && item.price <= 100,
          ),
        );
        // Active keyword search keeps its relevance order, regardless of seed.
        const queryOne = await repo.list({
          ...args,
          seed: "browse-one",
          filters: { q: brand },
        });
        const queryTwo = await repo.list({
          ...args,
          seed: "browse-two",
          filters: { q: brand },
        });
        assert.deepEqual(
          queryOne.items.map((item) => item.id),
          queryTwo.items.map((item) => item.id),
        );
        throw rollback;
      },
      { timeout: 20000 },
    );
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    await prisma.$disconnect();
  }
});

test("repeated purchase signals add up to the repeat cap", async (t) => {
  if (!process.env.DATABASE_URL_PRODUCT && !process.env.DATABASE_URL) {
    if (process.env.REQUIRE_INTEGRATION === "1")
      throw new Error("Test database URL required");
    t.skip("Set DATABASE_URL_PRODUCT to run PostgreSQL verification");
    return;
  }
  const rollback = new Error("rollback repeat fixtures");
  try {
    await prisma.$transaction(
      async (tx) => {
        const key = randomUUID();
        const category = `repeat-category-${key}`;
        const brand = `repeat-brand-${key}`;
        const condition = `repeat-condition-${key}`;
        await tx.condition.create({ data: { value: condition, label: "Test" } });
        const product = await tx.product.create({
          data: {
            title: "Repeat purchase fixture",
            sellerId: `repeat-seller-${key}`,
            category,
            brand,
            tags: [],
            size: "M",
            price: 100,
            condition,
          },
        });
        const repo = createRecommendationRepository(tx);
        const bought = normalizeProfile({ categories: [category], brands: [brand] });
        const scoreWith = async (count) => {
          const result = await repo.list({
            userId: `repeat-buyer-${key}`,
            skip: 0,
            take: await tx.product.count(),
            profile: normalizeProfile(),
            behavior: {
              purchases: Array.from({ length: count }, () => ({
                profile: bought,
                weight: weightFor("purchase"),
              })),
            },
          });
          return result.items.find((item) => item.id === product.id)
            .recommendation.score;
        };
        const single = weightFor("purchase") * 0.8;
        assert.equal(await scoreWith(1), single);
        assert.equal(await scoreWith(2), single * 2);
        // Further repeats stop at twice the purchase weight.
        assert.equal(await scoreWith(5), repeatCapFor("purchase"));
        throw rollback;
      },
      { timeout: 20000 },
    );
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    await prisma.$disconnect();
  }
});
