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

async function create(req, res, next) {
  try {
    const { order, created } = await reserveOrder({
      buyerId: req.userId,
      productId: req.body.productId,
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
      await respondAfterProductSync(res, updated, event);
      return;
    }

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
    if (order.status === "completed") {
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
        status: "completed",
        expectedVersion: order.version,
        expectedStatuses: ["pending", "pending_payment"],
        productSync,
      });

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
