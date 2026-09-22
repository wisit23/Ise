const test = require("node:test");
const assert = require("node:assert/strict");

const prisma = require("../../models/prismaClient");
const {
  completeProductReservation,
  reserveProduct,
} = require("./reservationService");

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

test("completeProductReservation treats an already-sold product as an idempotent retry", async (t) => {
  const originalUpdateMany = prisma.product.updateMany;
  const originalFindUnique = prisma.product.findUnique;
  t.after(() => {
    prisma.product.updateMany = originalUpdateMany;
    prisma.product.findUnique = originalFindUnique;
  });
  prisma.product.updateMany = async () => ({ count: 0 });
  prisma.product.findUnique = async () => ({
    status: "sold",
    reservationId: "reservation-1",
  });

  const changed = await completeProductReservation(
    "product-1",
    "reservation-1",
  );

  assert.equal(changed, false);
});

test("completeProductReservation still rejects an invalid active state", async (t) => {
  const originalUpdateMany = prisma.product.updateMany;
  const originalFindUnique = prisma.product.findUnique;
  t.after(() => {
    prisma.product.updateMany = originalUpdateMany;
    prisma.product.findUnique = originalFindUnique;
  });
  prisma.product.updateMany = async () => ({ count: 0 });
  prisma.product.findUnique = async () => ({ status: "available" });

  await assert.rejects(
    () => completeProductReservation("product-1", "reservation-1"),
    (error) => error.status === 409,
  );
});

test("completeProductReservation rejects a sold product from another reservation", async (t) => {
  const originalUpdateMany = prisma.product.updateMany;
  const originalFindUnique = prisma.product.findUnique;
  t.after(() => {
    prisma.product.updateMany = originalUpdateMany;
    prisma.product.findUnique = originalFindUnique;
  });
  prisma.product.updateMany = async () => ({ count: 0 });
  prisma.product.findUnique = async () => ({
    status: "sold",
    reservationId: "another-reservation",
  });

  await assert.rejects(
    () => completeProductReservation("product-1", "reservation-1"),
    (error) => error.status === 409,
  );
});
