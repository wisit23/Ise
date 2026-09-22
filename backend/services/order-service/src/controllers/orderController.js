const crypto = require("crypto");
const {
  badRequest,
  conflict,
  notFound,
  forbidden,
  parsePagination,
  paginatedResponse,
} = require("@reloop/shared");
const orderModel = require("../models/orderModel");
const productClient = require("../services/productClient");
const chatClient = require("../services/chatClient");
const buyerActivityClient = require("../services/buyerActivityClient");
const { reserveOrder } = require("../features/checkout/checkoutService");
const orderTransitionService = require("../services/orderTransitionService");
const productSyncService = require("../services/productSyncService");

function productSyncFor(order, status, purpose) {
  if (status === "cancelled" && order.reservationId) {
    return {
      dedupeKey: `${purpose}:${order.id}:${order.version}`,
      action: productSyncService.ACTIONS.RELEASE_RESERVATION,
      productId: order.productId,
      reservationId: order.reservationId,
    };
  }
  return {
    dedupeKey: `${purpose}:${order.id}:${order.version}`,
    action: productSyncService.ACTIONS.SET_STATUS,
    productId: order.productId,
    targetStatus: status === "completed" ? "sold" : "available",
  };
}

async function respondAfterProductSync(res, order, event) {
  try {
    await productSyncService.processEvent(event.id);
    res.json(order);
  } catch {
    // The durable outbox worker will retry. A 202 tells the caller that the
    // local transition committed but the cross-service projection is pending.
    res.status(202).json({ ...order, productSyncPending: true });
  }
}

async function dispatchOrderCompletedEvent(order) {
  const event = {
    eventId: crypto.randomUUID(),
    orderId: order.id,
    campaignId: order.campaignId || null,
    grossAmount: order.price,
    discountAmount: order.discountAmount || 0,
    netAmount:
      order.finalPrice !== null && order.finalPrice !== undefined
        ? order.finalPrice
        : Math.max(0, order.price - (order.discountAmount || 0)),
    completedAt: new Date().toISOString(),
  };

  try {
    await productClient.recordOrderCompleted(event);
  } catch (err) {
    console.warn(
      "[order-service] failed to dispatch order.completed.v1 event:",
      err.message,
    );
  }
}

async function create(req, res, next) {
  try {
    const { order, created } = await reserveOrder({
      buyerId: req.userId,
      productId: req.body.productId,
      campaignId: req.body.campaignId,
    });
    await buyerActivityClient.recordOrderActivity(order, "ORDER_PLACED", {
      reservationId: order.reservationId,
    });
    res.status(created ? 201 : 200).json(order);
  } catch (err) {
    next(err);
  }
}

async function mine(req, res, next) {
  try {
    const pagination = parsePagination(req.query, 10);
    const { status } = req.query;
    if (status && !orderModel.VALID_STATUSES.includes(status)) {
      throw badRequest(
        `status must be one of ${orderModel.VALID_STATUSES.join(", ")}`,
      );
    }
    if (!status || status === "pending_payment") {
      await orderModel.cleanExpiredOrders(productClient);
    }
    const { items, total } = await orderModel.listByBuyer(req.userId, {
      status,
      skip: pagination.skip,
      take: pagination.take,
    });
    res.json(paginatedResponse(items, total, pagination));
  } catch (err) {
    next(err);
  }
}

async function selling(req, res, next) {
  try {
    const pagination = parsePagination(req.query, 10);
    const { status } = req.query;
    if (status && !orderModel.VALID_STATUSES.includes(status)) {
      throw badRequest(
        `status must be one of ${orderModel.VALID_STATUSES.join(", ")}`,
      );
    }
    const { items, total } = await orderModel.listBySeller(req.userId, {
      status,
      skip: pagination.skip,
      take: pagination.take,
    });
    res.json(paginatedResponse(items, total, pagination));
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const order = await orderModel.findById(req.params.id);
    if (!order) throw notFound("order not found");
    if (order.buyerId !== req.userId && order.sellerId !== req.userId) {
      throw forbidden("you are not part of this order");
    }
    res.json(order);
  } catch (err) {
    next(err);
  }
}

// disputed/refunded are set only through the dispute flow (CSS-003's
// disputeService), never by a buyer/seller PATCHing status directly.
const USER_SETTABLE_STATUSES = [
  "pending",
  "confirmed",
  "shipped",
  "completed",
  "cancelled",
];

async function updateStatus(req, res, next) {
  try {
    const order = await orderModel.findById(req.params.id);
    if (!order) throw notFound("order not found");
    if (order.buyerId !== req.userId && order.sellerId !== req.userId) {
      throw forbidden("you are not part of this order");
    }

    const { status } = req.body;
    if (!USER_SETTABLE_STATUSES.includes(status)) {
      throw badRequest(
        `status must be one of ${USER_SETTABLE_STATUSES.join(", ")}`,
      );
    }

    // TSR-02: Prevent participant updating status while order has open dispute or hold
    orderTransitionService.assertCanParticipantUpdateStatus(order);

    if (["cancelled", "completed"].includes(status)) {
      const { order: updated, event } =
        await orderModel.transitionStatusWithProductSync({
          id: req.params.id,
          status,
          expectedVersion: order.version,
          expectedStatuses: [order.status],
          productSync: productSyncFor(order, status, "ORDER_STATUS"),
        });

      if (order.campaignId) {
        const voucherAction =
          status === "cancelled" ? "releaseVoucher" : "completeVoucher";
        await productClient[voucherAction](order.campaignId, {
          userId: order.buyerId,
          orderId: order.id,
        });
      }
      if (status === "completed") {
        await dispatchOrderCompletedEvent(updated);
      } else {
        await buyerActivityClient.recordOrderActivity(
          updated,
          "ORDER_CANCELLED",
          { initiatedBy: req.userId },
        );
      }
      await chatClient.notifyOrderStatusChanged(order, status);
      await respondAfterProductSync(res, updated, event);
      return;
    }

    // Best-effort — chatClient swallows its own errors internally (see its
    // comment) so a chat-service outage can never fail this status update.
    // Awaited anyway, not fire-and-forget: this is a low-traffic path
    // (one call per status change, not per page view), and awaiting makes
    // "the SYSTEM message exists by the time this request returns" an
    // actual guarantee instead of a race a test would have to poll for.
    await chatClient.notifyOrderStatusChanged(order, status);

    const updated = await orderModel.updateStatus(
      req.params.id,
      status,
      order.version,
    );
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

/** Called by review-service (service-to-service, internal token) to check whether
 * an order exists/belongs to the reviewer/is eligible for a review. */
async function getOneInternal(req, res, next) {
  try {
    const order = await orderModel.findById(req.params.id);
    if (!order) throw notFound("order not found");
    res.json(order);
  } catch (err) {
    next(err);
  }
}

/** Mock checkout: buyer pays for a locked cart item. Moves the reserved product to sold. */
async function pay(req, res, next) {
  try {
    const order = await orderModel.findById(req.params.id);
    if (!order) throw notFound("order not found");
    if (order.buyerId !== req.userId) {
      throw forbidden("only the buyer can pay for this order");
    }
    if (order.status === "confirmed") {
      const pendingEvent = await productSyncService.findPendingForOrder(
        order.id,
      );
      if (pendingEvent) {
        await respondAfterProductSync(res, order, pendingEvent);
        return;
      }
    }
    if (!["pending", "pending_payment"].includes(order.status)) {
      throw badRequest(
        `order is already ${order.status}, it cannot be paid again`,
      );
    }

    // Guard against active hold / dispute
    orderTransitionService.assertCanParticipantUpdateStatus(order);

    if (
      order.reservationExpiresAt &&
      order.reservationExpiresAt <= new Date()
    ) {
      const { event } = await orderModel.transitionStatusWithProductSync({
        id: req.params.id,
        status: "cancelled",
        expectedVersion: order.version,
        expectedStatuses: ["pending", "pending_payment"],
        productSync: productSyncFor(order, "cancelled", "RESERVATION_EXPIRED"),
      });
      if (order.campaignId) {
        await productClient.releaseVoucher(order.campaignId, {
          userId: order.buyerId,
          orderId: order.id,
        });
      }
      try {
        await productSyncService.processEvent(event.id);
      } catch {
        // Persisted in the outbox and retried by the worker.
      }
      throw conflict("reservation has expired");
    }

    const productSync = order.reservationId
      ? {
          dedupeKey: `PAY:${order.id}:${order.version}`,
          action: productSyncService.ACTIONS.COMPLETE_RESERVATION,
          productId: order.productId,
          reservationId: order.reservationId,
        }
      : productSyncFor(order, "completed", "PAY");
    const { order: updated, event } =
      await orderModel.transitionStatusWithProductSync({
        id: req.params.id,
        status: "confirmed",
        expectedVersion: order.version,
        expectedStatuses: ["pending", "pending_payment"],
        productSync,
      });

    if (order.campaignId) {
      await productClient.completeVoucher(order.campaignId, {
        userId: order.buyerId,
        orderId: order.id,
      });
    }
    await buyerActivityClient.recordOrderActivity(updated, "PAYMENT_COMPLETED");

    await respondAfterProductSync(res, updated, event);
  } catch (err) {
    next(err);
  }
}

/**
 * Called by product-service (internal token) once an auction closes with a
 * winning bid. Creates the same shape of Order a normal "buy now" checkout
 * would, so the winner pays through the existing pay() flow below — Marketing
 * owns the auction/schedule, Order stays the only writer of Order state.
 */
async function createFromAuction(req, res, next) {
  try {
    const { auctionId, productId, productTitle, sellerId, buyerId, price } =
      req.body;
    if (!auctionId || !productId || !sellerId || !buyerId || !price) {
      throw badRequest(
        "auctionId, productId, sellerId, buyerId, price are required",
      );
    }

    // Idempotency: if an order was already created for this auction (e.g. race between BullMQ worker and page visit), return it.
    const existing = await orderModel.findByAuctionId(auctionId);
    if (existing) {
      return res.status(200).json(existing);
    }

    const order = await orderModel.create({
      buyerId,
      sellerId,
      productId,
      productTitle: productTitle || "",
      price,
      auctionId,
    });

    await productClient.setProductStatus(productId, "reserved");

    res.status(201).json(order);
  } catch (err) {
    if (err.code === "P2002") {
      const existing = await orderModel.findByAuctionId(req.body.auctionId);
      if (existing) {
        return res.status(200).json(existing);
      }
    }
    next(err);
  }
}

module.exports = {
  create,
  mine,
  selling,
  getOne,
  getOneInternal,
  updateStatus,
  pay,
  createFromAuction,
};
