const prisma = require("../models/prismaClient");
const orderModel = require("../models/orderModel");
const productClient = require("./productClient");
const chatClient = require("./chatClient");
const buyerActivityClient = require("./buyerActivityClient");
const productSyncService = require("./productSyncService");
const attributionOutboxService = require("./attributionOutboxService");
const { timing, isRefundingCancellation } = require("./orderLifecycle");

const SYSTEM_ACTOR = "system";

function productSyncFor(order, status, purpose) {
  if (!["cancelled", "payment_expired", "seller_confirmation_expired", "completed"].includes(status)) return null;
  const dedupeKey = `${purpose}:${order.id}:${order.version}`;
  // An unpaid reservation is released; a paid order already marked the
  // product sold, so a refunded cancellation relists it directly.
  if (
    ["cancelled", "payment_expired"].includes(status) &&
    order.reservationId &&
    !isRefundingCancellation(order, status)
  ) {
    return {
      dedupeKey,
      action: productSyncService.ACTIONS.RELEASE_RESERVATION,
      productId: order.productId,
      reservationId: order.reservationId,
    };
  }
  return {
    dedupeKey,
    action: productSyncService.ACTIONS.SET_STATUS,
    productId: order.productId,
    targetStatus: status === "completed" ? "sold" : "available",
  };
}

/**
 * Commits one status change plus its cross-service effects (product, voucher,
 * attribution, buyer activity, chat). Used by participants and by the sweeps
 * so an automatic transition behaves exactly like the button press.
 */
async function transition({ order, status, actorId, purpose = "ORDER_STATUS", reason }) {
  const { order: updated, event, attributionEvent } =
    await orderModel.transitionStatusWithProductSync({
      id: order.id,
      status,
      expectedVersion: order.version,
      expectedStatuses: [order.status],
      productSync: productSyncFor(order, status, purpose),
      actorId,
    });

  if (order.campaignId && ["cancelled", "payment_expired", "seller_confirmation_expired"].includes(status))
    await productClient.releaseVoucher(order.campaignId, {
      userId: order.buyerId,
      orderId: order.id,
    });
  if (order.campaignId && status === "completed")
    await productClient.completeVoucher(order.campaignId, {
      userId: order.buyerId,
      orderId: order.id,
      discountAmount:
        Number(order.originalAmount) - Number(order.ordersAmount),
    });
  if (status === "completed") {
    if (attributionEvent)
      attributionOutboxService
        .processEvent(attributionEvent.id)
        .catch((err) =>
          console.warn("attribution deferred to outbox worker:", err.message),
        );
    await buyerActivityClient.recordOrderActivity(updated, "ORDER_COMPLETED", {
      initiatedBy: actorId,
    });
  } else if (["cancelled", "payment_expired", "seller_confirmation_expired"].includes(status)) {
    await buyerActivityClient.recordOrderActivity(updated, "ORDER_CANCELLED", {
      initiatedBy: actorId,
    });
  }
  await chatClient.notifyOrderStatusChanged(order, status, { reason, actorId });
  return { order: updated, event };
}

const NOT_HELD = {
  payments: { none: { holds: { some: { releaseAt: null } } } },
};

// `scope` narrows a sweep to some orders (e.g. one buyer) for tests and tools.
async function sweep({ where, scope = {}, status, purpose }) {
  const rows = await prisma.order.findMany({
    where: { AND: [where, NOT_HELD, scope] },
    include: orderModel.INCLUDE,
    orderBy: { updatedAt: "asc" },
    take: 50,
  });
  let changed = 0;
  for (const row of rows) {
    try {
      const { event } = await transition({
        order: orderModel.view(row),
        status,
        actorId: SYSTEM_ACTOR,
        purpose,
      });
      changed++;
      // The product sync outbox worker retries anything that fails here.
      if (event)
        await productSyncService.processEvent(event.id).catch(() => {});
    } catch (err) {
      // A participant may have acted on the same order first (409).
      if (err.status !== 409)
        console.warn(`[order-lifecycle] ${purpose} ${row.id}:`, err.message);
    }
  }
  return changed;
}

function ago(ms, now) {
  return new Date(now.getTime() - ms);
}

/** No real carrier exists, so a shipped parcel is delivered after a delay. */
function deliverShippedOrders(now = new Date(), scope) {
  return sweep({
    scope,
    where: {
      status: "shipped",
      shippedAt: { lte: ago(timing.deliveryDelayMs(), now) },
    },
    status: "delivered",
    purpose: "AUTO_DELIVERED",
  });
}

/** The buyer did not confirm receipt in time, so the order closes itself. */
function completeDeliveredOrders(now = new Date(), scope) {
  return sweep({
    scope,
    where: {
      status: "delivered",
      deliveredAt: { lte: ago(timing.autoCompleteMs(), now) },
    },
    status: "completed",
    purpose: "AUTO_COMPLETED",
  });
}

/** The seller did not accept a paid order in time; expire and refund it. */
function cancelUnconfirmedOrders(now = new Date(), scope) {
  return sweep({
    scope,
    where: {
      status: "paid",
      payments: {
        some: {
          paymentStatus: "paid",
          paidAt: { lte: ago(timing.sellerConfirmTimeoutMs(), now) },
        },
      },
    },
    status: "seller_confirmation_expired",
    purpose: "SELLER_CONFIRM_TIMEOUT",
  });
}

async function runSweeps(now = new Date(), scope) {
  return {
    delivered: await deliverShippedOrders(now, scope),
    completed: await completeDeliveredOrders(now, scope),
    seller_confirmation_expired: await cancelUnconfirmedOrders(now, scope),
  };
}

function startWorker(intervalMs = Number(process.env.ORDER_LIFECYCLE_SWEEP_MS) || 5000) {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    runSweeps()
      .catch((err) =>
        console.warn("[order-service] lifecycle sweep failed:", err.message),
      )
      .finally(() => {
        running = false;
      });
  }, intervalMs);
  timer.unref();
  return timer;
}

module.exports = {
  SYSTEM_ACTOR,
  productSyncFor,
  transition,
  deliverShippedOrders,
  completeDeliveredOrders,
  cancelUnconfirmedOrders,
  runSweeps,
  startWorker,
};
