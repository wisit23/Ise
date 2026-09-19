const test = require("node:test");
const assert = require("node:assert/strict");

const prisma = require("../../models/prismaClient");
const { completeProductReservation } = require("./reservationService");

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
