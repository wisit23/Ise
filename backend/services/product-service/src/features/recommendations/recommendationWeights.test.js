const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");

function run(env, script) {
  const cleanEnv = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !key.startsWith("RECOMMENDATION_WEIGHT_"),
    ),
  );
  return spawnSync(process.execPath, ["-e", script], {
    cwd: __dirname,
    env: { ...cleanEnv, ...env },
    encoding: "utf8",
  });
}

test("env weights feed behavioral signals and profile explanations, including zero and fractions", () => {
  const result = run(
    {
      RECOMMENDATION_WEIGHT_CATEGORY: "0",
      RECOMMENDATION_WEIGHT_BRAND: "7.5",
      RECOMMENDATION_WEIGHT_SEARCH: "1.5",
      RECOMMENDATION_WEIGHT_PRODUCT_VIEW: "9",
      RECOMMENDATION_WEIGHT_VIDEO_VIEW: "4",
      RECOMMENDATION_WEIGHT_LIKE: "6",
      RECOMMENDATION_WEIGHT_PURCHASE: "12",
    },
    `
    const assert = require('node:assert/strict');
    const { explanation, weightFor } = require('./recommendationRules');
    const { createBehaviorRepository } = require('./behaviorRepository');
    const product = { category: 'shoes', brand: 'nike', tags: [] };
    const repo = createBehaviorRepository({
      recommendationSearch: { findMany: async () => [{ query: 'nike', searchedAt: new Date() }] },
      swipeChoice: { findMany: async () => [{ createdAt: new Date(), productVideo: { product } }] },
      recommendationView: { findMany: async () => ['product', 'video'].map(source => ({ source, product, viewedAt: new Date() })) },
      product: { findMany: async () => [{ ...product, id: 'p' }] },
    });
    (async () => {
      const behavior = await repo.get('buyer');
      assert.equal(behavior.searches[0].weight, 1.5);
      assert.equal(behavior.productViews[0].weight, 9);
      assert.equal(behavior.videoViews[0].weight, 4);
      assert.equal(behavior.likes[0].weight, 6);
      assert.equal((await repo.purchases([{ productId: 'p', purchasedAt: new Date() }]))[0].weight, 12);
      assert.equal(weightFor('size'), 5);
      assert.equal(explanation({ category: true, brand: true }).score, 7.5);
      assert.equal(explanation({ category: true }).reasons.length, 0);
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `,
  );
  assert.equal(result.status, 0, result.stderr);
});

test("unset or blank env uses defaults; invalid weights fail with the setting name", () => {
  const defaults = run(
    { RECOMMENDATION_WEIGHT_SEARCH: " " },
    `
    const assert = require('node:assert/strict');
    const { weightFor } = require('./recommendationRules');
    assert.equal(weightFor('search'), 3);
    assert.equal(weightFor('productView'), 5);
    assert.equal(weightFor('videoView'), 5);
  `,
  );
  assert.equal(defaults.status, 0, defaults.stderr);
  for (const value of ["-1", "NaN", "Infinity", "abc"]) {
    const result = run(
      { RECOMMENDATION_WEIGHT_SEARCH: value },
      "require('./recommendationRules')",
    );
    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /RECOMMENDATION_WEIGHT_SEARCH must be a finite non-negative number/,
    );
  }
});

test("repeat cap defaults to twice each weight, is configurable, and rejects values below 1", () => {
  const ok = run(
    { RECOMMENDATION_REPEAT_CAP: "3" },
    `
    const assert = require('node:assert/strict');
    const { repeatCapFor } = require('./recommendationRules');
    assert.equal(repeatCapFor('purchase'), 30);
  `,
  );
  assert.equal(ok.status, 0, ok.stderr);
  const defaults = run(
    {},
    `
    const assert = require('node:assert/strict');
    const { repeatCapFor } = require('./recommendationRules');
    assert.equal(repeatCapFor('purchase'), 20);
    assert.equal(repeatCapFor('like'), 16);
  `,
  );
  assert.equal(defaults.status, 0, defaults.stderr);
  for (const value of ["0.5", "NaN", "abc"]) {
    const result = run(
      { RECOMMENDATION_REPEAT_CAP: value },
      "require('./recommendationRules')",
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /RECOMMENDATION_REPEAT_CAP/);
  }
});
