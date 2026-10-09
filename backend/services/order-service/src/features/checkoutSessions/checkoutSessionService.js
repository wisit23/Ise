const { badRequest, conflict, forbidden, notFound } = require("@reloop/shared");
const prisma = require("../../models/prismaClient");
const productClient = require("../../services/productClient");
const buyerActivityClient = require("../../services/buyerActivityClient");
const orderModel = require("../../models/orderModel");
const { calculateOrderTotals, money } = require("../../models/money");
const { normalizeAddress } = require("../shipping/shippingService");
const PAYMENT_TTL_MS = 10 * 60 * 1000;
const INCLUDE = {
  orders: { include: orderModel.INCLUDE, orderBy: { createdAt: "asc" } },
};

function sessionView(row) {
  if (!row) return null;
  return {
    ...row,
    shippingAddress: row.addressSnapshot,
    expiresAt: row.cancelAt,
    subtotal: Number(row.originalAmount),
    total: Number(row.ordersAmount),
    discount: Number(money(row.originalAmount).minus(row.ordersAmount)),
    couponCode: null,
    orders: (row.orders || []).map(orderModel.view),
  };
}
function createCheckoutSessionService(
  db,
  products,
  activities = { recordOrderActivity: async () => false },
) {
  async function findOwnedSession(id, buyerId, tx = db) {
    const row = await tx.checkout.findUnique({
      where: { id },
      include: INCLUDE,
    });
    if (!row) throw notFound("checkout session not found");
    if (row.buyerId !== buyerId)
      throw forbidden("this checkout session belongs to another buyer");
    return row;
  }
  async function create({
    buyerId,
    orderIds,
    addressId,
    shippingAddress,
    couponCode,
    now = new Date(),
  }) {
    if (
      !Array.isArray(orderIds) ||
      !orderIds.length ||
      orderIds.some((id) => typeof id !== "string" || !id)
    )
      throw badRequest("orderIds must be a non-empty array of IDs");
    const ids = [...new Set(orderIds)];
    if (ids.length > 20) throw badRequest("a checkout is limited to 20 orders");
    if (typeof addressId !== "string" || !addressId.trim())
      throw badRequest("addressId is required");
    if (couponCode)
      throw badRequest("apply voucher codes per order, not per checkout");
    const addressSnapshot = normalizeAddress(shippingAddress);
    const orders = await db.order.findMany({
      where: { id: { in: ids }, buyerId },
      include: orderModel.INCLUDE,
    });
    if (orders.length !== ids.length)
      throw notFound("one or more orders were not found");
    const existing = [
      ...new Set(orders.map((o) => o.checkoutId).filter(Boolean)),
    ];
    if (
      existing.length === 1 &&
      orders.every((o) => o.checkoutId === existing[0])
    ) {
      const checkout = await findOwnedSession(existing[0], buyerId);
      if (
        checkout.status === "pending" &&
        checkout.cancelAt > now &&
        checkout.orders.length === ids.length &&
        checkout.orders.every((o) => ids.includes(o.id))
      )
        return sessionView(checkout);
    }
    if (existing.length)
      throw conflict("one or more orders already have a checkout");
    for (const order of orders) {
      if (!["pending", "pending_payment"].includes(order.status))
        throw conflict("order is no longer awaiting payment");
      if (order.basket && order.basket.unlockAt <= now)
        throw conflict("reservation has expired");
    }
    const totals = calculateOrderTotals(orders);
    const cancelAt = new Date(now.getTime() + PAYMENT_TTL_MS);
    await Promise.all(
      orders
        .filter((o) => o.basketId)
        .map((o) =>
          products.extendProductReservation(o.productId, o.basketId, cancelAt),
        ),
    );
    return sessionView(
      await db.$transaction(async (tx) => {
        const checkout = await tx.checkout.create({
          data: {
            buyerId,
            addressId: addressId.trim(),
            addressSnapshot,
            ...totals,
            status: "pending",
            cancelAt,
          },
        });
        for (const order of orders) {
          const claimed = await tx.order.updateMany({
            where: {
              id: order.id,
              buyerId,
              checkoutId: null,
              version: order.version,
              status: { in: ["pending", "pending_payment"] },
            },
            data: { checkoutId: checkout.id, version: { increment: 1 } },
          });
          if (claimed.count !== 1)
            throw conflict("cart changed while checkout was being created");
          if (order.basketId)
            await tx.basket.update({
              where: { id: order.basketId },
              data: { unlockAt: cancelAt },
            });
          await tx.shipping.create({
            data: {
              orderId: order.id,
              addressId: addressId.trim(),
              addressSnapshot,
              status: "pending",
            },
          });
          await tx.orderLog.create({
            data: orderModel.logData(order, buyerId, "CHECKOUT_CREATED", {
              checkoutId: checkout.id,
            }),
          });
        }
        return tx.checkout.findUnique({
          where: { id: checkout.id },
          include: INCLUDE,
        });
      }),
    );
  }
  async function expire(checkout, { now = new Date() } = {}) {
    const row = await db.$transaction(async (tx) => {
      const claimed = await tx.checkout.updateMany({
        where: { id: checkout.id, status: "pending", cancelAt: { lte: now } },
        data: { status: "expired" },
      });
      if (claimed.count !== 1)
        return tx.checkout.findUnique({
          where: { id: checkout.id },
          include: INCLUDE,
        });
      for (const order of checkout.orders) {
        if (!["pending", "pending_payment"].includes(order.status)) continue;
        const changed = await tx.order.updateMany({
          where: {
            id: order.id,
            version: order.version,
            status: { in: ["pending", "pending_payment"] },
          },
          data: { status: "cancelled", version: { increment: 1 } },
        });
        if (changed.count !== 1)
          throw conflict("order changed during checkout expiry");
        if (order.basketId)
          await tx.basket.update({
            where: { id: order.basketId },
            data: { status: "expired" },
          });
        await tx.orderLog.create({
          data: orderModel.logData(
            order,
            order.buyerId,
            "PRODUCT_SYNC_REQUESTED",
            order.basketId
              ? {
                  action: "RELEASE_RESERVATION",
                  productId: order.productId,
                  reservationId: order.basketId,
                }
              : {
                  action: "SET_STATUS",
                  productId: order.productId,
                  targetStatus: "available",
                },
          ),
        });
        await tx.orderLog.create({
          data: orderModel.logData(order, order.buyerId, "CHECKOUT_EXPIRED", {
            checkoutId: checkout.id,
          }),
        });
      }
      return tx.checkout.findUnique({
        where: { id: checkout.id },
        include: INCLUDE,
      });
    });
    for (const order of row.orders) {
      if (order.status === "cancelled" && order.campaignId)
        await products.releaseVoucher(order.campaignId, {
          userId: order.buyerId,
          orderId: order.id,
        });
    }
    return row;
  }
  async function get({ buyerId, sessionId, now = new Date() }) {
    let row = await findOwnedSession(sessionId, buyerId);
    if (row.status === "pending" && row.cancelAt <= now)
      row = await expire(row, { now });
    return sessionView(row);
  }
  async function confirm({ buyerId, sessionId, now = new Date() }) {
    let checkout = await findOwnedSession(sessionId, buyerId);
    if (checkout.status === "paid") return sessionView(checkout);
    if (!["pending", "processing"].includes(checkout.status))
      throw conflict("checkout is no longer payable");
    if (checkout.status === "pending" && checkout.cancelAt <= now) {
      await expire(checkout, { now });
      throw conflict("QR payment time has expired");
    }
    if (checkout.status === "pending") {
      checkout = await db.$transaction(async (tx) => {
        const claimed = await tx.checkout.updateMany({
          where: { id: checkout.id, status: "pending", cancelAt: { gt: now } },
          data: { status: "processing" },
        });
        if (claimed.count !== 1)
          throw conflict("checkout changed during payment");
        for (const order of checkout.orders) {
          if (!["pending", "pending_payment"].includes(order.status))
            throw conflict("order is no longer payable");
          const changed = await tx.order.updateMany({
            where: {
              id: order.id,
              version: order.version,
              status: { in: ["pending", "pending_payment"] },
            },
            data: { status: "confirmed", version: { increment: 1 } },
          });
          if (changed.count !== 1)
            throw conflict("order changed during payment");
          await tx.payment.create({
            data: {
              orderId: order.id,
              paymentType: "SIMULATED",
              paymentStatus: "paid",
              paymentAmount: order.ordersAmount,
              paidAt: now,
            },
          });
          if (order.basketId)
            await tx.basket.update({
              where: { id: order.basketId },
              data: { status: "purchased" },
            });
          await tx.orderLog.create({
            data: orderModel.logData(
              order,
              buyerId,
              "PRODUCT_SYNC_REQUESTED",
              order.basketId
                ? {
                    action: "COMPLETE_RESERVATION",
                    productId: order.productId,
                    reservationId: order.basketId,
                  }
                : {
                    action: "SET_STATUS",
                    productId: order.productId,
                    targetStatus: "sold",
                  },
            ),
          });
          await tx.orderLog.create({
            data: orderModel.logData(order, buyerId, "PAYMENT_COMPLETED", {
              checkoutId: checkout.id,
            }),
          });
        }
        return tx.checkout.findUnique({
          where: { id: checkout.id },
          include: INCLUDE,
        });
      });
    }
    // Local payment is committed once. Retries resume idempotent downstream calls.
    for (const order of checkout.orders) {
      const event =
        await require("../../services/productSyncService").findPendingForOrder(
          order.id,
          db,
        );
      if (event)
        await require("../../services/productSyncService").processEvent(
          event.id,
          { db, client: products },
        );
      if (order.campaignId)
        await products.completeVoucher(order.campaignId, {
          userId: buyerId,
          orderId: order.id,
        });
    }
    const paidAt = checkout.orders[0]?.payments?.find(
      (p) => p.paymentStatus === "paid",
    )?.paidAt;
    if (!paidAt) throw conflict("checkout has no successful payment timestamp");
    await db.checkout.updateMany({
      where: { id: checkout.id, status: "processing" },
      data: {
        status: "paid",
        paidAt,
      },
    });
    const paid = await db.checkout.findUnique({
      where: { id: checkout.id },
      include: INCLUDE,
    });
    await Promise.all(
      paid.orders.map((order) =>
        activities.recordOrderActivity(
          orderModel.view(order),
          "PAYMENT_COMPLETED",
          { checkoutSessionId: paid.id },
        ),
      ),
    );
    return sessionView(paid);
  }
  async function updateAddress({
    buyerId,
    sessionId,
    addressId,
    shippingAddress,
  }) {
    if (typeof addressId !== "string" || !addressId.trim())
      throw badRequest("addressId is required");
    const addressSnapshot = normalizeAddress(shippingAddress);
    return sessionView(
      await db.$transaction(async (tx) => {
        const checkout = await findOwnedSession(sessionId, buyerId, tx);
        const changed = await tx.checkout.updateMany({
          where: {
            id: sessionId,
            status: "pending",
            cancelAt: { gt: new Date() },
          },
          data: { addressId: addressId.trim(), addressSnapshot },
        });
        if (changed.count !== 1)
          throw conflict(
            "only pending checkout addresses can be changed together",
          );
        for (const order of checkout.orders) {
          const claimed = await tx.order.updateMany({
            where: {
              id: order.id,
              version: order.version,
              status: { in: ["pending", "pending_payment"] },
            },
            data: { version: { increment: 1 } },
          });
          if (claimed.count !== 1)
            throw conflict("order changed during address update");
          await tx.shipping.update({
            where: { orderId: order.id },
            data: { addressId: addressId.trim(), addressSnapshot },
          });
          await tx.orderLog.create({
            data: orderModel.logData(
              order,
              buyerId,
              "SHIPPING_ADDRESS_CHANGED",
              {
                before: order.shipping && {
                  addressId: order.shipping.addressId,
                  addressSnapshot: order.shipping.addressSnapshot,
                },
                after: { addressId: addressId.trim(), addressSnapshot },
              },
            ),
          });
        }
        return tx.checkout.findUnique({
          where: { id: sessionId },
          include: INCLUDE,
        });
      }),
    );
  }
  async function expireDue({ now = new Date() } = {}) {
    const rows = await db.checkout.findMany({
      where: { status: "pending", cancelAt: { lte: now } },
      include: INCLUDE,
      take: 100,
    });
    for (const row of rows) await expire(row, { now });
    return rows.length;
  }
  function startExpiryWorker() {
    let running = false;
    const timer = setInterval(async () => {
      if (running) return;
      running = true;
      try {
        await expireDue();
      } catch (error) {
        console.error("[order-service] checkout expiry sweep failed", error);
      } finally {
        running = false;
      }
    }, 5000);
    timer.unref();
    return timer;
  }
  return { create, get, confirm, updateAddress, expireDue, startExpiryWorker };
}
const service = createCheckoutSessionService(
  prisma,
  productClient,
  buyerActivityClient,
);
module.exports = {
  ...service,
  createCheckoutSessionService,
  calculateOrderTotals,
  PAYMENT_TTL_MS,
};
