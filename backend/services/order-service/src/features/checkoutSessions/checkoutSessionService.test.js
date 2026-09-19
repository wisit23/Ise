const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createCheckoutSessionService,
  calculateDiscount,
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

test("coupon discount rules match the checkout UI", () => {
  assert.deepEqual(calculateDiscount("RELOOPNEW", 1000), {
    couponCode: "RELOOPNEW",
    discount: 50,
  });
  assert.deepEqual(calculateDiscount("VINTAGE15", 2000), {
    couponCode: "VINTAGE15",
    discount: 150,
  });
  assert.throws(
    () => calculateDiscount("UNKNOWN", 1000),
    (err) => err.status === 400,
  );
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
    couponCode: "RELOOPNEW",
    now,
  });

  const expectedExpiry = new Date(now.getTime() + PAYMENT_TTL_MS);
  assert.equal(session.total, 950);
  assert.equal(session.expiresAt.toISOString(), expectedExpiry.toISOString());
  assert.equal(
    extended[0].expiresAt.toISOString(),
    expectedExpiry.toISOString(),
  );
});

test("expiry releases the product and cancels checkout orders", async () => {
  const now = new Date("2026-08-10T12:11:00.000Z");
  const order = pendingOrder();
  const session = {
    id: "session-1",
    buyerId: "buyer-1",
    status: "pending",
    expiresAt: new Date("2026-08-10T12:10:00.000Z"),
    orders: [order],
  };
  const released = [];
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
  assert.equal(cancelledWhere.checkoutSessionId, "session-1");
});

test("a retried processing session resumes only unfinished orders", async () => {
  const now = new Date("2026-08-10T12:05:00.000Z");
  const confirmed = pendingOrder({ id: "order-1", status: "confirmed" });
  const unfinished = pendingOrder({
    id: "order-2",
    productId: "product-2",
    reservationId: "reservation-2",
  });
  const session = {
    id: "session-1",
    buyerId: "buyer-1",
    status: "processing",
    expiresAt: new Date("2026-08-10T12:10:00.000Z"),
    orders: [confirmed, unfinished],
  };
  const completedProducts = [];
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
  assert.deepEqual(updatedOrders, [{ id: "order-2", status: "confirmed" }]);
  assert.deepEqual(
    recordedActivities.map(({ orderId, action }) => ({ orderId, action })),
    [
      { orderId: "order-1", action: "PAYMENT_COMPLETED" },
      { orderId: "order-2", action: "PAYMENT_COMPLETED" },
    ],
  );
});
