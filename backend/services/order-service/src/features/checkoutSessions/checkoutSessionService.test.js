const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createCheckoutSessionService,
  calculateOrderTotals,
  PAYMENT_TTL_MS,
} = require("./checkoutSessionService");

function pendingOrder(overrides = {}) {
  return {
    id: "order-1",
    buyerId: "buyer-1",
    productId: "product-1",
    productTitle: "Vintage jacket",
    price: 1000,
    status: "pending_payment",
    reservationId: "reservation-1",
    reservationExpiresAt: new Date("2026-08-10T12:05:00.000Z"),
    checkoutSessionId: null,
    checkoutSession: null,
    createdAt: new Date("2026-08-10T12:00:00.000Z"),
    ...overrides,
  };
}

const ADDRESS = {
  recipientName: "สมชาย ใจดี",
  phone: "0812345678",
  addressLine: "99 ถนนสุขุมวิท",
  subdistrict: "คลองเตย",
  district: "คลองเตย",
  province: "กรุงเทพมหานคร",
  postalCode: "10110",
};

test("checkout totals use the Marketing voucher prices stored on orders", () => {
  assert.deepEqual(
    calculateOrderTotals([
      pendingOrder({
        discountAmount: 200,
        finalPrice: 800,
        campaignId: "campaign-1",
        campaignCode: "SAVE200",
      }),
      pendingOrder({
        id: "order-2",
        price: 500,
        discountAmount: 0,
        finalPrice: 500,
      }),
    ]),
    { subtotal: 1500, discount: 200, total: 1300 },
  );
});

test("checkout rejects inconsistent persisted campaign pricing", () => {
  assert.throws(
    () =>
      calculateOrderTotals([
        pendingOrder({ discountAmount: 200, finalPrice: 900 }),
      ]),
    (err) => err.status === 409,
  );
});

test("checkout derives final price for orders created before finalPrice existed", () => {
  assert.deepEqual(
    calculateOrderTotals([
      pendingOrder({ discountAmount: 0, finalPrice: null }),
    ]),
    { subtotal: 1000, discount: 0, total: 1000 },
  );
});

test("legacy hard-coded checkout coupons are rejected", async () => {
  const order = pendingOrder();
  const prisma = {
    order: { findMany: async () => [order] },
    checkoutSession: { findUnique: async () => null },
  };
  const service = createCheckoutSessionService(prisma, {});

  await assert.rejects(
    service.create({
      buyerId: "buyer-1",
      orderIds: ["order-1"],
      shippingAddress: ADDRESS,
      couponCode: "RELOOPNEW",
      now: new Date("2026-08-10T12:00:00.000Z"),
    }),
    (err) => err.status === 400,
  );
});

test("creating a checkout session preserves Marketing voucher totals", async () => {
  const now = new Date("2026-08-10T12:00:00.000Z");
  const order = pendingOrder({
    campaignId: "campaign-1",
    campaignCode: "SAVE200",
    discountAmount: 200,
    finalPrice: 800,
  });
  let sessionData;
  const tx = {
    checkoutSession: {
      create: async ({ data }) => {
        sessionData = { id: "session-1", ...data };
        return sessionData;
      },
      findUnique: async () => ({ ...sessionData, orders: [order] }),
    },
    order: { updateMany: async () => ({ count: 1 }) },
  };
  const prisma = {
    order: { findMany: async () => [order] },
    checkoutSession: { findUnique: async () => null },
    $transaction: async (callback) => callback(tx),
  };
  const products = { extendProductReservation: async () => {} };
  const service = createCheckoutSessionService(prisma, products);

  const session = await service.create({
    buyerId: "buyer-1",
    orderIds: ["order-1"],
    shippingAddress: ADDRESS,
    now,
  });

  assert.equal(session.subtotal, 1000);
  assert.equal(session.discount, 200);
  assert.equal(session.total, 800);
  assert.equal(session.couponCode, null);
});

test("creating a checkout session starts a fresh ten-minute payment window", async () => {
  const now = new Date("2026-08-10T12:00:00.000Z");
  const order = pendingOrder();
  const extended = [];
  let sessionData;

  const tx = {
    checkoutSession: {
      create: async ({ data }) => {
        sessionData = { id: "session-1", ...data };
        return sessionData;
      },
      findUnique: async () => ({ ...sessionData, orders: [order] }),
    },
    order: {
      updateMany: async () => ({ count: 1 }),
    },
  };
  const prisma = {
    order: { findMany: async () => [order] },
    checkoutSession: { findUnique: async () => null },
    $transaction: async (callback) => callback(tx),
  };
  const products = {
    extendProductReservation: async (productId, reservationId, expiresAt) => {
      extended.push({ productId, reservationId, expiresAt });
    },
  };
  const service = createCheckoutSessionService(prisma, products);

  const session = await service.create({
    buyerId: "buyer-1",
    orderIds: ["order-1"],
    shippingAddress: ADDRESS,
    now,
  });

  const expectedExpiry = new Date(now.getTime() + PAYMENT_TTL_MS);
  assert.equal(session.total, 1000);
  assert.equal(session.expiresAt.toISOString(), expectedExpiry.toISOString());
  assert.equal(
    extended[0].expiresAt.toISOString(),
    expectedExpiry.toISOString(),
  );
});

test("expiry releases the product and cancels checkout orders", async () => {
  const now = new Date("2026-08-10T12:11:00.000Z");
  const order = pendingOrder({ campaignId: "campaign-1" });
  const session = {
    id: "session-1",
    buyerId: "buyer-1",
    status: "pending",
    expiresAt: new Date("2026-08-10T12:10:00.000Z"),
    orders: [order],
  };
  const released = [];
  const releasedVouchers = [];
  let cancelledWhere;

  const tx = {
    order: {
      updateMany: async ({ where }) => {
        cancelledWhere = where;
        return { count: 1 };
      },
    },
    checkoutSession: {
      update: async () => ({ ...session, status: "expired" }),
    },
  };
  const prisma = {
    checkoutSession: {
      findMany: async () => [session],
      updateMany: async () => ({ count: 1 }),
    },
    $transaction: async (callback) => callback(tx),
  };
  const products = {
    releaseVoucher: async (campaignId, context) => {
      releasedVouchers.push({ campaignId, ...context });
    },
    releaseProductReservation: async (productId, reservationId) => {
      released.push({ productId, reservationId });
    },
  };
  const service = createCheckoutSessionService(prisma, products);

  const count = await service.expireDue({ now });

  assert.equal(count, 1);
  assert.deepEqual(released, [
    { productId: "product-1", reservationId: "reservation-1" },
  ]);
  assert.deepEqual(releasedVouchers, [
    {
      campaignId: "campaign-1",
      userId: "buyer-1",
      orderId: "order-1",
    },
  ]);
  assert.equal(cancelledWhere.checkoutSessionId, "session-1");
});

test("a retried processing session resumes only unfinished orders", async () => {
  const now = new Date("2026-08-10T12:05:00.000Z");
  const confirmed = pendingOrder({ id: "order-1", status: "confirmed" });
  const unfinished = pendingOrder({
    id: "order-2",
    productId: "product-2",
    reservationId: "reservation-2",
    campaignId: "campaign-1",
  });
  const session = {
    id: "session-1",
    buyerId: "buyer-1",
    status: "processing",
    expiresAt: new Date("2026-08-10T12:10:00.000Z"),
    orders: [confirmed, unfinished],
  };
  const completedProducts = [];
  const completedVouchers = [];
  const updatedOrders = [];
  const prisma = {
    checkoutSession: {
      findUnique: async () => session,
      updateMany: async () => ({ count: 1 }),
    },
    order: {
      updateMany: async ({ where, data }) => {
        updatedOrders.push({ id: where.id, status: data.status });
        return { count: 1 };
      },
    },
    $transaction: async (callback) =>
      callback({
        checkoutSession: {
          update: async () => ({ ...session, status: "paid" }),
        },
      }),
  };
  const products = {
    completeProductReservation: async (productId) => {
      completedProducts.push(productId);
    },
    completeVoucher: async (campaignId, context) => {
      completedVouchers.push({ campaignId, ...context });
    },
  };
  const recordedActivities = [];
  const activities = {
    recordOrderActivity: async (order, action, metadata) => {
      recordedActivities.push({ orderId: order.id, action, metadata });
      return true;
    },
  };
  const service = createCheckoutSessionService(prisma, products, activities);

  const result = await service.confirm({
    buyerId: "buyer-1",
    sessionId: "session-1",
    now,
  });

  assert.equal(result.status, "paid");
  assert.deepEqual(completedProducts, ["product-2"]);
  assert.deepEqual(completedVouchers, [
    {
      campaignId: "campaign-1",
      userId: "buyer-1",
      orderId: "order-2",
    },
  ]);
  assert.deepEqual(updatedOrders, [{ id: "order-2", status: "confirmed" }]);
  assert.deepEqual(
    recordedActivities.map(({ orderId, action }) => ({ orderId, action })),
    [
      { orderId: "order-1", action: "PAYMENT_COMPLETED" },
      { orderId: "order-2", action: "PAYMENT_COMPLETED" },
    ],
  );
});
