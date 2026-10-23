const test = require("node:test");
const assert = require("node:assert/strict");
const {
  INTEREST_SCORE_BANDS,
  INTEREST_SCORE_MAX,
  scoreInterest,
  maximumScoreFor,
  bandForScore,
} = require("./interestScore");

test("defines the agreed score bands and global maximum", () => {
  assert.equal(INTEREST_SCORE_MAX, 33);
  assert.deepEqual(
    INTEREST_SCORE_BANDS.map(({ min, max }) => [min, max]),
    [[0, 0], [1, 6], [7, 14], [15, 24], [25, 33]],
  );
  assert.equal(bandForScore(0).key, "none");
  assert.equal(bandForScore(6.5).key, "moderate");
  assert.equal(bandForScore(24.5).key, "very_high");
});

test("scores profile and strongest behavior signals without accumulating repeats", () => {
  const result = scoreInterest({
    criteria: {
      category: "รองเท้า",
      brand: "Nike",
      style: "Running",
    },
    profile: {
      categories: ["รองเท้า"],
      brands: ["Nike"],
      styles: ["Running"],
      sizes: [{ category: "รองเท้า", values: ["42"] }],
    },
    behavior: {
      searches: [
        { query: "nike", weight: 3 },
        { query: "nike running", weight: 6 },
      ],
      likes: [
        {
          weight: 8,
          profile: {
            categories: ["รองเท้า"],
            brands: ["Nike"],
            styles: ["Running"],
          },
        },
      ],
      purchases: [
        {
          weight: 10,
          profile: {
            categories: ["รองเท้า"],
            brands: ["Nike"],
            styles: ["Running"],
          },
        },
      ],
    },
  });
  assert.equal(result.score, 33);
  assert.deepEqual(result.sources, {
    profile: 9,
    search: 6,
    like: 8,
    purchase: 10,
  });
});

test("rejects size as a marketing interest target", () => {
  assert.throws(
    () => scoreInterest({ criteria: { category: "รองเท้า", size: "42" }, profile: {} }),
    /ไม่รองรับไซซ์/,
  );
});

test("normalizes behavioral similarity to the selected campaign dimensions", () => {
  const result = scoreInterest({
    criteria: { brand: "Nike" },
    profile: { brands: ["Nike"] },
    behavior: {
      likes: [{ weight: 8, profile: { brands: ["Nike"] } }],
      purchases: [{ weight: 10, profile: { brands: ["Nike"] } }],
    },
  });
  assert.equal(result.score, 20);
  assert.equal(maximumScoreFor({ brand: "Nike" }), 26);
});

test("treats a longer search phrase as interest when it contains a selected target", () => {
  const result = scoreInterest({
    criteria: { brand: "Nike" },
    profile: {},
    behavior: { searches: [{ query: "รองเท้า nike มือสอง", weight: 6 }] },
  });
  assert.equal(result.sources.search, 6);
  assert.equal(result.score, 6);
});
