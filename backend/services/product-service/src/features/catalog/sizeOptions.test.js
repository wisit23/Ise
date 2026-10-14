const test = require("node:test");
const assert = require("node:assert/strict");
const { groupSizesByCategory } = require("./sizeOptions");
test("sizes are grouped by category, not copied from a global size list", () => {
  const result = groupSizesByCategory([
    { category: "เสื้อ", size: "M" },
    { category: "เสื้อ", size: "L" },
    { category: "เสื้อ", size: "M" },
    { category: "รองเท้า", size: "40" },
    { category: "รองเท้า", size: "41" },
    { category: "กระเป๋า", size: "" },
  ]);
  assert.deepEqual(result.find((g) => g.category === "เสื้อ").values, [
    "L",
    "M",
  ]);
  assert.deepEqual(result.find((g) => g.category === "รองเท้า").values, [
    "40",
    "41",
  ]);
  assert.equal(
    result.some((g) => g.category === "กระเป๋า"),
    false,
  );
});
test("normalized category membership and legacy categories both receive only the product size", () => {
  const result = groupSizesByCategory([
    {
      category: "เสื้อ",
      size: " M ",
      categoryLinks: [
        { category: { name: "เสื้อ" } },
        { category: { name: "เสื้อยืด" } },
      ],
    },
  ]);
  assert.equal(result.length, 2);
  assert.ok(result.every((g) => g.values.length === 1 && g.values[0] === "M"));
});
