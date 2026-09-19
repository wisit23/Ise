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

test("Order write failure with voucher releases BOTH voucher hold and product reservation", async () => {
  const releasedProducts = [];
  const releasedVouchers = [];
  const productClient = {
    reserveProduct: async () => ({
      created: true,
      reservationId: "res-both-1",
      expiresAt: "2026-08-10T12:10:00.000Z",
      product: PRODUCT,
    }),
    quoteAndHold: async (campaignId, { userId, orderId }) => ({
      campaignId,
      campaignCode: "SAVE200",
      discountAmount: 200,
      finalPrice: 1000,
    }),
    releaseVoucher: async (campaignId, { userId, orderId }) => {
      releasedVouchers.push({ campaignId, userId, orderId });
    },
    releaseProductReservation: async (productId, reservationId) => {
      releasedProducts.push({ productId, reservationId });
    },
  };
  const orderModel = {
    findByReservationId: async () => null,
    create: async () => {
      throw new Error("DB write failure");
    },
  };

  await assert.rejects(
    reserveOrder(
      { buyerId: "buyer-1", productId: PRODUCT.id, campaignId: "camp-both" },
      { productClient, orderModel },
    ),
    /DB write failure/,
  );
  assert.equal(releasedProducts.length, 1);
  assert.equal(releasedProducts[0].productId, PRODUCT.id);
  assert.equal(releasedVouchers.length, 1);
  assert.equal(releasedVouchers[0].campaignId, "camp-both");
});

test("reuses the Order for an existing reservation instead of creating a duplicate and does NOT update price", async () => {
  const existingOrder = {
    id: "order-1",
    buyerId: "buyer-1",
    reservationId: "reservation-1",
    price: 1200,
    finalPrice: 1200,
  };
  let createCalls = 0;
  let releaseCalls = 0;
  let quoteCalls = 0;
  const productClient = {
    reserveProduct: async () => ({
      created: false,
      reservationId: "reservation-1",
      expiresAt: "2026-08-10T12:10:00.000Z",
      product: PRODUCT,
    }),
    quoteAndHold: async () => {
      quoteCalls += 1;
    },
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

  // Client attempts to pass campaignId / malicious finalPrice on existing order
  const result = await reserveOrder(
    { buyerId: "buyer-1", productId: PRODUCT.id, campaignId: "camp-hacker", finalPrice: 0 },
    { productClient, orderModel },
  );

  assert.deepEqual(result, { order: existingOrder, created: false });
  assert.equal(createCalls, 0);
  assert.equal(releaseCalls, 0);
  assert.equal(quoteCalls, 0);
});

test("P2002 retry returns existing order without creating duplicate", async () => {
  const existingOrder = {
    id: "order-p2002",
    buyerId: "buyer-1",
    reservationId: "res-p2002",
  };
  let findCount = 0;
  const productClient = {
    reserveProduct: async () => ({
      created: true,
      reservationId: "res-p2002",
      expiresAt: "2026-08-10T12:10:00.000Z",
      product: PRODUCT,
    }),
    releaseProductReservation: async () => {},
  };
  const orderModel = {
    findByReservationId: async () => {
      findCount += 1;
      // First check before create returns null; retry check after P2002 returns existingOrder
      return findCount === 1 ? null : existingOrder;
    },
    create: async () => {
      const err = new Error("Unique constraint failed");
      err.code = "P2002";
      throw err;
    },
  };

  const result = await reserveOrder(
    { buyerId: "buyer-1", productId: PRODUCT.id },
    { productClient, orderModel },
  );
  assert.deepEqual(result, { order: existingOrder, created: false });
});

test("calculates discount and finalPrice from backend quoteAndHold, ignoring client tampering", async () => {
  let createdOrderData = null;
  const productClient = {
    reserveProduct: async () => ({
      created: true,
      reservationId: "reservation-tamper-1",
      expiresAt: "2026-08-10T12:10:00.000Z",
      product: { ...PRODUCT, price: 1000 },
    }),
    quoteAndHold: async (campaignId, { userId, orderId, productId }) => {
      assert.equal(campaignId, "camp-10");
      assert.equal(userId, "buyer-1");
      assert.equal(productId, PRODUCT.id);
      assert.ok(orderId);
      return {
        campaignId: "camp-10",
        campaignCode: "SAVE10",
        discountAmount: 100,
        finalPrice: 900,
      };
    },
    releaseProductReservation: async () => {},
  };
  const orderModel = {
    findByReservationId: async () => null,
    create: async (data) => {
      createdOrderData = data;
      return { ...data };
    },
  };

  // Attacker attempts to send malicious values: finalPrice: 0, discountAmount: 99999, fake campaignCode
  const result = await reserveOrder(
    {
      buyerId: "buyer-1",
      productId: PRODUCT.id,
      campaignId: "camp-10",
      campaignCode: "FAKE_SUPER_FREE",
      discountAmount: 99999,
      finalPrice: 0,
    },
    { productClient, orderModel },
  );

  assert.equal(result.created, true);
  // Server must enforce the server-validated values, NOT the attacker's values!
  assert.equal(createdOrderData.discountAmount, 100);
  assert.equal(createdOrderData.finalPrice, 900);
  assert.equal(createdOrderData.campaignCode, "SAVE10");
  assert.ok(createdOrderData.id, "pre-generated orderId exists");
});

test("rejects order and releases reservation if voucher quoteAndHold fails (expired / wrong category / 409)", async () => {
  const released = [];
  const productClient = {
    reserveProduct: async () => ({
      created: true,
      reservationId: "reservation-invalid-voucher",
      expiresAt: "2026-08-10T12:10:00.000Z",
      product: PRODUCT,
    }),
    quoteAndHold: async () => {
      const err = new Error("voucher has expired or wrong category");
      err.status = 400;
      throw err;
    },
    releaseProductReservation: async (productId, reservationId) => {
      released.push({ productId, reservationId });
    },
  };
  const orderModel = {
    findByReservationId: async () => null,
    create: async () => {},
  };

  await assert.rejects(
    reserveOrder(
      { buyerId: "buyer-1", productId: PRODUCT.id, campaignId: "camp-expired" },
      { productClient, orderModel },
    ),
    /voucher has expired or wrong category/,
  );
  assert.deepEqual(released, [
    { productId: PRODUCT.id, reservationId: "reservation-invalid-voucher" },
  ]);
});
