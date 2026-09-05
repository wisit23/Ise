const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildCreateProductData,
  buildProductPatch,
} = require("./productPayload");

test("buildCreateProductData applies defaults and normalizes client arrays", () => {
  const data = buildCreateProductData("seller-1", {
    title: "Denim jacket",
    price: 1200,
    category: "Jackets",
    tags: [" Vintage ", "vintage", "", null, "DENIM"],
    media: [
      { url: "https://example.test/front.jpg", type: "image" },
      { url: "https://example.test/demo.mp4", type: "video" },
      { url: "https://example.test/back.jpg", type: "unknown" },
      { type: "image" },
      null,
    ],
  });

  assert.equal(data.brand, "");
  assert.deepEqual(data, {
    sellerId: "seller-1",
    title: "Denim jacket",
    description: "",
    price: 1200,
    category: "Jackets",
    brand: "",
    condition: "Good",
    size: "Free size",
    tags: ["vintage", "denim"],
    media: [
      { url: "https://example.test/front.jpg", type: "image" },
      { url: "https://example.test/demo.mp4", type: "video" },
      { url: "https://example.test/back.jpg", type: "image" },
    ],
    location: "",
  });
});

test("trims brands on create and update while preserving empty defaults", () => {
  assert.equal(
    buildCreateProductData("seller-1", { brand: "  Nike  " }).brand,
    "Nike",
  );
  assert.equal(buildProductPatch({ brand: "   " }).brand, "");
});

test("buildProductPatch includes only submitted fields", () => {
  const patch = buildProductPatch({
    title: "Updated title",
    description: undefined,
    tags: [" One ", "ONE", "Two"],
    media: null,
  });

  assert.deepEqual(patch, {
    title: "Updated title",
    tags: ["one", "two"],
    media: [],
  });
});

test("buildProductPatch preserves scalar values but ignores reservation status", () => {
  const patch = buildProductPatch({
    description: "",
    condition: null,
    location: null,
    status: "sold",
  });

  assert.deepEqual(patch, {
    description: "",
    condition: null,
    location: null,
  });
});
