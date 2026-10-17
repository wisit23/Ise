const crypto = require("crypto");
const {
  badRequest,
  conflict,
  notFound,
  forbidden,
  parsePagination,
  paginatedResponse,
  restrictionsForStatus,
  CAPABILITY,
} = require("@reloop/shared");
const orderModel = require("../models/orderModel");
const productClient = require("../services/productClient");
const chatClient = require("../services/chatClient");
const buyerActivityClient = require("../services/buyerActivityClient");
const authClient = require("../services/authClient");
const { reserveOrder } = require("../features/checkout/checkoutService");
const { authorizeReservation } = require("../services/reservationAuthorization");
const orderTransitionService = require("../services/orderTransitionService");
const orderLifecycle = require("../services/orderLifecycle");
const orderLifecycleService = require("../services/orderLifecycleService");
const productSyncService = require("../services/productSyncService");
const { money } = require("../models/money");
const prisma = require("../models/prismaClient");
const shippingService =
  require("../features/shipping/shippingService").createShippingService(prisma);

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
    const { order, created } = await reserveOrder(
      {
        buyerId: req.userId,
        productId: req.body.productId,
        campaignId: req.body.campaignId,
      },
      {
        authorizeReservation,
      },
    );
    await buyerActivityClient.recordOrderActivity(order, "ORDER_PLACED", {
      reservationId: order.reservationId,
    });
    if(created)await chatClient.notifyOrderPlaced(order);
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

// Only the transitions in orderLifecycle.PARTICIPANT_TRANSITIONS can be
// requested here. paid/delivered/timeouts come from the system, and
// disputed/refunded only through the dispute flow (CSS-003's disputeService).

/** Seller accepts a paid order; same rules as PATCH status "confirmed". */
function confirmOrder(req, res, next) {
  req.body = { ...req.body, status: "confirmed" };
  return updateStatus(req, res, next);
}

/** Seller rejects a paid order (refunded by the lifecycle) with a reason. */
function rejectOrder(req, res, next) {
  req.body = { ...req.body, status: "cancelled" };
  return updateStatus(req, res, next);
}
async function updateStatus(req, res, next) {
  try {
    const order = await orderModel.findById(req.params.id);
    if (!order) throw notFound("order not found");
    if (order.buyerId !== req.userId && order.sellerId !== req.userId) {
      throw forbidden("you are not part of this order");
    }

    const { status } = req.body;
    if (status === "cancelled" && !orderLifecycle.isRefundingCancellation(order, status))
      orderTransitionService.assertCanCancelOrder(order);
    orderLifecycle.assertParticipantTransition(order, req.userId, status);
    // TSR-02: Prevent participant updating status while order has open dispute or hold
    orderTransitionService.assertCanParticipantUpdateStatus(order);

    if (status === "shipped") {
      if (order.sellerId !== req.userId) {
        throw forbidden("only the seller can mark this order as shipped");
      }
      const shipped = await shippingService.markShipped({
        orderId: order.id,
        actorId: req.userId,
        version: order.version,
        company: req.body.company,
        trackingNumber: req.body.trackingNumber,
      });
      // Best-effort — chatClient swallows its own errors internally so a
      // chat-service outage can never fail this status update.
      await chatClient.notifyOrderStatusChanged(order, status);
      return res.json(shipped);
    }

    const { order: updated, event } = await orderLifecycleService.transition({
      order,
      status,
      actorId: req.userId,
      reason: req.body.reason?.trim() || undefined,
    });
    if (event) return respondAfterProductSync(res, updated, event);
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

/** Called by product-service's review feature (service-to-service, internal token) to check whether
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
    if (order.buyerId !== req.userId)
      throw forbidden("only the buyer can pay for this order");
    if (
      order.orderType === "AUCTION" &&
      order.paymentDeadlineAt &&
      new Date(order.paymentDeadlineAt) <= new Date()
    ) {
      throw conflict(
        "auction payment deadline has expired; the right to purchase is being reassigned",
      );
    }
    orderTransitionService.assertCanParticipantUpdateStatus(order);
    if (!order.checkoutId)
      throw badRequest(
        "create a checkout with a shipping address before payment",
      );
    const count = await prisma.order.count({
      where: { checkoutId: order.checkoutId },
    });
    if (count !== 1)
      throw conflict("confirm the checkout to pay for all selected orders");
    try {
      const checkout =
        await require("../features/checkoutSessions/checkoutSessionService").confirm(
          { buyerId: req.userId, sessionId: order.checkoutId },
        );
      res.json(checkout.orders.find((item) => item.id === order.id));
    } catch (error) {
      const checkout = await prisma.checkout.findUnique({
        where: { id: order.checkoutId },
      });
      if (checkout?.status === "processing" && error.status !== 409) {
        return res.status(202).json({
          ...(await orderModel.findById(order.id)),
          productSyncPending: true,
        });
      }
      throw error;
    }
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
    const {
      auctionId,
      auctionBidId,
      productId,
      sellerId,
      buyerId,
      price,
      paymentDeadlineAt,
    } = req.body;
    if (!auctionId || !productId || !sellerId || !buyerId || !price) {
      throw badRequest(
        "auctionId, productId, sellerId, buyerId, price are required",
      );
    }

    // Idempotency: concise deterministic ID for auction order (e.g. AUC-A1B2C3D4E5)
    const stableId =
      "AUC-" +
      crypto
        .createHash("sha256")
        .update(String(auctionId))
        .digest("hex")
        .slice(0, 10)
        .toUpperCase();
    const existing = await orderModel.findById(stableId);
    if (existing) {
      return res.status(200).json(existing);
    }

    const [buyer, seller] = await Promise.all([
      authClient.getUser(buyerId),
      authClient.getUser(sellerId),
    ]);
    if (!buyer || !seller) {
      throw badRequest("auction buyer or seller account was not found");
    }
    if (restrictionsForStatus(buyer.status).includes(CAPABILITY.BUYER)) {
      throw forbidden("auction winner's purchase rights are restricted");
    }
    if (restrictionsForStatus(seller.status).includes(CAPABILITY.SELLER)) {
      throw forbidden("auction seller's selling rights are restricted");
    }
    if (buyer.status !== "ACTIVE" || seller.status !== "ACTIVE") {
      throw forbidden("auction buyer and seller accounts must be active");
    }

    const order = await orderModel.create({
      id: stableId,
      buyerId,
      sellerId,
      productId,
      originalAmount: money(price),
      ordersAmount: money(price),
      orderType: "AUCTION",
      auctionId: String(auctionId),
      auctionBidId: auctionBidId ? String(auctionBidId) : null,
      paymentDeadlineAt: paymentDeadlineAt
        ? new Date(paymentDeadlineAt)
        : new Date(Date.now() + 24 * 60 * 60 * 1000),
      productTitle: req.body.productTitle || null,
      status: "pending_payment",
    });

    await productClient.setProductStatus(productId, "reserved");
    await chatClient.notifyOrderPlaced(order);

    res.status(201).json(order);
  } catch (err) {
    if (err.code === "P2002") {
      const stableId =
        "AUC-" +
        crypto
          .createHash("sha256")
          .update(String(req.body.auctionId))
          .digest("hex")
          .slice(0, 10)
          .toUpperCase();
      const existing = await orderModel.findById(stableId);
      if (existing) {
        return res.status(200).json(existing);
      }
    }
    next(err);
  }
}

async function updateShippingAddress(req, res, next) {
  try {
    res.json(
      await shippingService.updateAddress({
        orderId: req.params.id,
        buyerId: req.userId,
        addressId: req.body.addressId,
        shippingAddress: req.body.shippingAddress,
        authorization: req.headers.authorization,
        version: req.body.version,
      }),
    );
  } catch (err) {
    next(err);
  }
}
async function getByProductInternal(req, res, next) {
  try {
    const order = await prisma.order.findFirst({
      where: {
        productId: req.params.productId,
        status: { notIn: ["cancelled", "refunded"] },
      },
      select: {
        id: true,
        buyerId: true,
        sellerId: true,
        status: true,
      },
    });
    res.json(order || null);
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
  getByProductInternal,
  updateStatus,
  confirmOrder,
  rejectOrder,
  pay,
  createFromAuction,
  updateShippingAddress,
};
