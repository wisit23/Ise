const test = require("node:test");
const assert = require("node:assert/strict");
const { parseCatalogFilters } = require("./catalogQuery");

test("catalog filters combine and preserve style as persisted tags", () => {
  assert.deepEqual(
    parseCatalogFilters({
      category: "รองเท้า",
      style: "vintage",
      brand: "Nike",
      size: "M",
      condition: "Good",
      minPrice: "500",
      maxPrice: "1500",
    }),
    {
      category: "รองเท้า",
      style: "vintage",
      brand: "Nike",
      size: "M",
      condition: "Good",
      minPrice: 500,
      maxPrice: 1500,
    },
  );
});

test("catalog trims strings and treats whitespace-only values as absent", () => {
  assert.deepEqual(
    parseCatalogFilters({
      q: "  ",
      category: "  ",
      style: " VINTAGE ",
      brand: " Nike ",
      minPrice: "  ",
      maxPrice: "  ",
    }),
    {
      style: "vintage",
      brand: "Nike",
    },
  );
  assert.deepEqual(parseCatalogFilters({ q: "  jacket  ", minPrice: " 0 " }), {
    q: "jacket",
    minPrice: 0,
  });
});

test("catalog rejects invalid, negative, and reversed prices consistently", () => {
  for (const query of [
    { minPrice: "nope" },
    { minPrice: "-1" },
    { minPrice: "20", maxPrice: "10" },
  ]) {
    assert.throws(() => parseCatalogFilters(query), /Price|price/);
  }
});
