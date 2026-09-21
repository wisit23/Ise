const test = require("node:test");
const assert = require("node:assert/strict");

const prisma = require("../../models/prismaClient");
const { reserveProduct } = require("./reservationService");

test("a seller cannot reserve their own product", async (t) => {
  const delegate = prisma.product;
  const originalFindUnique = Object.getOwnPropertyDescriptor(
    delegate,
    "findUnique",
  );
  const originalUpdateMany = Object.getOwnPropertyDescriptor(
    delegate,
    "updateMany",
  );
  let updateManyCalls = 0;
  Object.defineProperty(delegate, "findUnique", {
    configurable: true,
    value: async () => ({
      id: "product-own",
      sellerId: "seller-a",
      title: "Own product",
      price: 500,
      status: "available",
      reservationId: null,
      reservedBy: null,
      reservationExpiresAt: null,
    }),
  });
  Object.defineProperty(delegate, "updateMany", {
    configurable: true,
    value: async () => {
      updateManyCalls += 1;
      throw new Error("must not be called");
    },
  });
  t.after(() => {
    Object.defineProperty(delegate, "findUnique", originalFindUnique);
    Object.defineProperty(delegate, "updateMany", originalUpdateMany);
  });

  await assert.rejects(
    () => reserveProduct("product-own", "seller-a"),
    /cannot buy your own listing/,
  );
  assert.equal(updateManyCalls, 0);
});
