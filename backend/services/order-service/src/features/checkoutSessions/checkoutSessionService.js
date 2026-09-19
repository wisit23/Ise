const { badRequest, conflict, forbidden, notFound } = require("@reloop/shared");
const prisma = require("../../models/prismaClient");
const productClient = require("../../services/productClient");
const buyerActivityClient = require("../../services/buyerActivityClient");

const PAYMENT_TTL_MS = 10 * 60 * 1000;
const EXPIRY_SWEEP_INTERVAL_MS = 5 * 1000;
const MAX_ORDERS_PER_SESSION = 20;
const ADDRESS_FIELDS = [
  "recipientName",
  "phone",
  "addressLine",
  "subdistrict",
  "district",
  "province",
  "postalCode",
];

const COUPONS = {
  RELOOPNEW: { minSpend: 300, type: "fixed", value: 50 },
  FREESHIP40: { minSpend: 200, type: "fixed", value: 40 },
  VINTAGE15: { minSpend: 500, type: "percent", value: 15, max: 150 },
};

function normalizeAddress(address) {
  if (!address || typeof address !== "object" || Array.isArray(address)) {
    throw badRequest("shippingAddress is required");
  }
  const snapshot = {};
  for (const field of ADDRESS_FIELDS) {
    if (typeof address[field] !== "string" || !address[field].trim()) {
      throw badRequest(`shippingAddress.${field} is required`);
    }
    snapshot[field] = address[field].trim();
  }
  return snapshot;
}

function calculateDiscount(couponCode, subtotal) {
  if (!couponCode) return { couponCode: null, discount: 0 };
  const normalized = String(couponCode).trim().toUpperCase();
  const coupon = COUPONS[normalized];
  if (!coupon) throw badRequest("coupon code is invalid");
  if (subtotal < coupon.minSpend) {
    throw badRequest(`coupon requires a minimum spend of ${coupon.minSpend}`);
  }

  const raw =
    coupon.type === "percent"
      ? Math.floor((subtotal * coupon.value) / 100)
      : coupon.value;
  const discount = Math.min(raw, coupon.max ?? raw, subtotal);
  return { couponCode: normalized, discount };
}

function createCheckoutSessionService(
  prismaClient,
  productService,
  activityService = { recordOrderActivity: async () => false },
) {
  async function recordPaymentActivities(session) {
    await Promise.all(
      session.orders.map((order) =>
        activityService.recordOrderActivity(order, "PAYMENT_COMPLETED", {
          checkoutSessionId: session.id,
          checkoutTotal: session.total,
        }),
      ),
    );
  }

  async function findOwnedSession(sessionId, buyerId) {
    const session = await prismaClient.checkoutSession.findUnique({
      where: { id: sessionId },
      include: { orders: { orderBy: { createdAt: "asc" } } },
    });
    if (!session) throw notFound("checkout session not found");
    if (session.buyerId !== buyerId) {
      throw forbidden("this checkout session belongs to another buyer");
    }
    return session;
  }

  async function releaseOrder(order) {
    if (order.reservationId) {
      await productService.releaseProductReservation(
        order.productId,
        order.reservationId,
      );
    } else {
      await productService.setProductStatus(order.productId, "available");
    }
  }

  async function expire(session, { now = new Date() } = {}) {
    const claimed = await prismaClient.checkoutSession.updateMany({
      where: {
        id: session.id,
        status: { in: ["pending", "processing"] },
        expiresAt: { lte: now },
      },
      data: { status: "expiring" },
    });
    if (claimed.count !== 1) {
      return prismaClient.checkoutSession.findUnique({
        where: { id: session.id },
        include: { orders: true },
      });
    }

    try {
      await Promise.all(
        session.orders
          .filter((order) =>
            ["pending", "pending_payment"].includes(order.status),
          )
          .map(releaseOrder),
      );
      return prismaClient.$transaction(async (tx) => {
        await tx.order.updateMany({
          where: {
            checkoutSessionId: session.id,
            status: { in: ["pending", "pending_payment"] },
          },
          data: { status: "cancelled" },
        });
        const processedOrders = session.orders.filter((order) =>
          ["confirmed", "completed"].includes(order.status),
        ).length;
        return tx.checkoutSession.update({
          where: { id: session.id },
          data: { status: processedOrders > 0 ? "partial" : "expired" },
          include: { orders: true },
        });
      });
    } catch (error) {
      await prismaClient.checkoutSession.updateMany({
        where: { id: session.id, status: "expiring" },
        data: { status: "pending" },
      });
      throw error;
    }
  }

  async function create({
    buyerId,
    orderIds,
    shippingAddress,
    couponCode,
    now,
  }) {
    const clock = now ?? new Date();
    if (!Array.isArray(orderIds)) throw badRequest("orderIds must be an array");
    const uniqueOrderIds = [...new Set(orderIds.filter(Boolean))];
    if (uniqueOrderIds.length === 0) {
      throw badRequest("at least one order is required");
    }
    if (uniqueOrderIds.length > MAX_ORDERS_PER_SESSION) {
      throw badRequest(
        `a checkout is limited to ${MAX_ORDERS_PER_SESSION} orders`,
      );
    }
    const addressSnapshot = normalizeAddress(shippingAddress);

    const orders = await prismaClient.order.findMany({
      where: { id: { in: uniqueOrderIds }, buyerId },
      include: { checkoutSession: true },
      orderBy: { createdAt: "asc" },
    });
    if (orders.length !== uniqueOrderIds.length) {
      throw notFound("one or more orders were not found");
    }

    const existingSessionIds = [
      ...new Set(
        orders.map((order) => order.checkoutSessionId).filter(Boolean),
      ),
    ];
    if (existingSessionIds.length === 1) {
      const existing = await findOwnedSession(existingSessionIds[0], buyerId);
      if (existing.status === "pending" && existing.expiresAt > clock) {
        return existing;
      }
    }
    if (existingSessionIds.length > 0) {
      throw conflict("one or more orders already have a checkout session");
    }

    for (const order of orders) {
      if (!["pending", "pending_payment"].includes(order.status)) {
        throw conflict(`order ${order.id} is already ${order.status}`);
      }
      if (order.reservationExpiresAt && order.reservationExpiresAt <= clock) {
        throw conflict(`reservation for order ${order.id} has expired`);
      }
    }

    const subtotal = orders.reduce((sum, order) => sum + order.price, 0);
    const coupon = calculateDiscount(couponCode, subtotal);
    const expiresAt = new Date(clock.getTime() + PAYMENT_TTL_MS);

    await Promise.all(
      orders
        .filter((order) => order.reservationId)
        .map((order) =>
          productService.extendProductReservation(
            order.productId,
            order.reservationId,
            expiresAt,
          ),
        ),
    );

    return prismaClient.$transaction(async (tx) => {
      const session = await tx.checkoutSession.create({
        data: {
          buyerId,
          shippingAddress: addressSnapshot,
          couponCode: coupon.couponCode,
          subtotal,
          discount: coupon.discount,
          total: subtotal - coupon.discount,
          expiresAt,
        },
      });
      const attached = await tx.order.updateMany({
        where: {
          id: { in: uniqueOrderIds },
          buyerId,
          status: { in: ["pending", "pending_payment"] },
          checkoutSessionId: null,
        },
        data: {
          checkoutSessionId: session.id,
          reservationExpiresAt: expiresAt,
        },
      });
      if (attached.count !== orders.length) {
        throw conflict("cart changed while checkout was being created");
      }
      return tx.checkoutSession.findUnique({
        where: { id: session.id },
        include: { orders: { orderBy: { createdAt: "asc" } } },
      });
    });
  }

  async function get({ buyerId, sessionId, now }) {
    const clock = now ?? new Date();
    let session = await findOwnedSession(sessionId, buyerId);
    if (
      ["pending", "processing"].includes(session.status) &&
      session.expiresAt <= clock
    ) {
      session = await expire(session, { now: clock });
    }
    return session;
  }

  async function confirm({ buyerId, sessionId, now }) {
    const clock = now ?? new Date();
    const session = await findOwnedSession(sessionId, buyerId);
    if (session.status === "paid") {
      await recordPaymentActivities(session);
      return session;
    }
    if (!["pending", "processing"].includes(session.status)) {
      throw conflict(`checkout session is already ${session.status}`);
    }
    if (session.expiresAt <= clock) {
      await expire(session, { now: clock });
      throw conflict("QR payment time has expired");
    }

    if (session.status === "pending") {
      const claimed = await prismaClient.checkoutSession.updateMany({
        where: {
          id: session.id,
          status: "pending",
          expiresAt: { gt: clock },
        },
        data: { status: "processing" },
      });
      if (claimed.count !== 1) {
        throw conflict("checkout session is already being processed");
      }
    }

    // Persist each paid item immediately in the confirmed (awaiting seller)
    // state. If a downstream service is temporarily unavailable, retrying this
    // endpoint resumes only the orders that have not been confirmed yet.
    for (const order of session.orders) {
      if (["confirmed", "completed"].includes(order.status)) continue;
      if (order.reservationId) {
        await productService.completeProductReservation(
          order.productId,
          order.reservationId,
        );
      } else {
        await productService.setProductStatus(order.productId, "sold");
      }
      await prismaClient.order.updateMany({
        where: {
          id: order.id,
          checkoutSessionId: session.id,
          status: { in: ["pending", "pending_payment"] },
        },
        data: { status: "confirmed" },
      });
    }

    const paidSession = await prismaClient.$transaction(async (tx) => {
      return tx.checkoutSession.update({
        where: { id: session.id },
        data: { status: "paid", paidAt: clock },
        include: { orders: true },
      });
    });
    await recordPaymentActivities(paidSession);
    return paidSession;
  }

  async function expireDue({ now = new Date() } = {}) {
    const sessions = await prismaClient.checkoutSession.findMany({
      where: {
        status: { in: ["pending", "processing"] },
        expiresAt: { lte: now },
      },
      include: { orders: true },
      take: 100,
    });
    for (const session of sessions) {
      await expire(session, { now });
    }
    return sessions.length;
  }

  function startExpiryWorker() {
    const sweep = () => {
      expireDue().catch((error) => {
        console.error("[order-service] checkout expiry sweep failed", error);
      });
    };
    sweep();
    const timer = setInterval(sweep, EXPIRY_SWEEP_INTERVAL_MS);
    timer.unref();
    return timer;
  }

  return { create, get, confirm, expireDue, startExpiryWorker };
}

const service = createCheckoutSessionService(
  prisma,
  productClient,
  buyerActivityClient,
);

module.exports = service;
module.exports.createCheckoutSessionService = createCheckoutSessionService;
module.exports.calculateDiscount = calculateDiscount;
module.exports.PAYMENT_TTL_MS = PAYMENT_TTL_MS;
