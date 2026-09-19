const test = require("node:test");
const assert = require("node:assert/strict");

const {
  validateSegmentRule,
  matchesSegment,
} = require("./segmentRule");

test("Buyer Segmentation Rule Engine Suite", async (t) => {
  await t.test("validateSegmentRule: accepts empty or null targetSegment", () => {
    assert.equal(validateSegmentRule(null), true);
    assert.equal(validateSegmentRule(undefined), true);
    assert.equal(validateSegmentRule({ type: "all" }), true);
    assert.equal(validateSegmentRule({ type: "rules", rules: [] }), true);
  });

  await t.test("validateSegmentRule: rejects invalid field or operator", () => {
    assert.throws(
      () =>
        validateSegmentRule({
          type: "rules",
          rules: [{ field: "hairColor", operator: "eq", value: "black" }],
        }),
      /invalid segment field/i
    );

    assert.throws(
      () =>
        validateSegmentRule({
          type: "rules",
          rules: [{ field: "favoriteCategory", operator: "like", value: "Shirt" }],
        }),
      /invalid segment operator/i
    );

    assert.throws(
      () =>
        validateSegmentRule({
          type: "rules",
          rules: [{ field: "preferredSize", operator: "in", value: "M" }], // not array
        }),
      /requires a non-empty array value/i
    );
  });

  await t.test("matchesSegment: universal campaigns match everyone", () => {
    assert.equal(matchesSegment(null, null), true);
    assert.equal(matchesSegment(null, { type: "all" }), true);
    assert.equal(matchesSegment({ favoriteCategory: "Shirts" }, null), true);
  });

  await t.test("matchesSegment: targeted campaigns require profile", () => {
    const rule = {
      type: "rules",
      rules: [{ field: "favoriteCategory", operator: "eq", value: "Dresses" }],
    };
    assert.equal(matchesSegment(null, rule), false);
    assert.equal(matchesSegment({}, rule), false);
  });

  await t.test("matchesSegment: eq matches case-insensitively", () => {
    const rule = {
      type: "rules",
      rules: [{ field: "favoriteCategory", operator: "eq", value: "Vintage" }],
    };
    assert.equal(matchesSegment({ favoriteCategory: "vintage" }, rule), true);
    assert.equal(matchesSegment({ favoriteCategory: "Modern" }, rule), false);
  });

  await t.test("matchesSegment: supports preferredSize and sizePreference aliases", () => {
    const rule = {
      type: "rules",
      rules: [{ field: "preferredSize", operator: "eq", value: "M" }],
    };
    assert.equal(matchesSegment({ sizePreference: "m" }, rule), true);
    assert.equal(matchesSegment({ preferredSize: "L" }, rule), false);
  });

  await t.test("matchesSegment: in and nin operators evaluate correctly", () => {
    const inRule = {
      type: "rules",
      rules: [{ field: "styleTag", operator: "in", value: ["Streetwear", "Y2K"] }],
    };
    assert.equal(matchesSegment({ stylePreference: "streetwear" }, inRule), true);
    assert.equal(matchesSegment({ stylePreference: "Minimal" }, inRule), false);

    const ninRule = {
      type: "rules",
      rules: [{ field: "styleTag", operator: "nin", value: ["Formal"] }],
    };
    assert.equal(matchesSegment({ styleTag: "Streetwear" }, ninRule), true);
    assert.equal(matchesSegment({ styleTag: "formal" }, ninRule), false);
  });
});
