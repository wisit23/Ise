const test = require("node:test");
const assert = require("node:assert/strict");

const { reserveOrder } = require("./checkoutService");

const PRODUCT = {
  id: "product-1",
  sellerId: "seller-1",
  title: "Vintage jacket",
  price: 1200,
};

test("releases a newly-created product reservation when the Order write fails", async () => {
  const released = [];
  const productClient = {
    reserveProduct: async () => ({
      created: true,
      reservationId: "reservation-1",
      expiresAt: "2026-08-10T12:10:00.000Z",
      product: PRODUCT,
    }),
    releaseProductReservation: async (productId, reservationId) => {
      released.push({ productId, reservationId });
    },
  };
  const orderModel = {
    findByReservationId: async () => null,
    create: async () => {
      throw new Error("order database unavailable");
    },
  };

  await assert.rejects(
    reserveOrder(
      { buyerId: "buyer-1", productId: PRODUCT.id },
      { productClient, orderModel },
    ),
    /order database unavailable/,
  );
  assert.deepEqual(released, [
    { productId: PRODUCT.id, reservationId: "reservation-1" },
  ]);
});

test("reuses the Order for a retried reservation instead of creating a duplicate", async () => {
  const existingOrder = {
    id: "order-1",
    buyerId: "buyer-1",
    reservationId: "reservation-1",
  };
  let createCalls = 0;
  let releaseCalls = 0;
  const productClient = {
    reserveProduct: async () => ({
      created: false,
      reservationId: "reservation-1",
      expiresAt: "2026-08-10T12:10:00.000Z",
      product: PRODUCT,
    }),
    releaseProductReservation: async () => {
      releaseCalls += 1;
    },
  };
  const orderModel = {
    findByReservationId: async () => existingOrder,
    create: async () => {
      createCalls += 1;
    },
  };

  const result = await reserveOrder(
    { buyerId: "buyer-1", productId: PRODUCT.id },
    { productClient, orderModel },
  );

  assert.deepEqual(result, { order: existingOrder, created: false });
  assert.equal(createCalls, 0);
  assert.equal(releaseCalls, 0);
});
