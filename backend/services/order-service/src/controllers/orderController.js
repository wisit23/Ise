const attributionOutboxService = require("../services/attributionOutboxService");
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
const productSyncService = require("../services/productSyncService");
const { money } = require("../models/money");
const prisma = require("../models/prismaClient");
const shippingService =
  require("../features/shipping/shippingService").createShippingService(prisma);

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

// disputed/refunded are set only through the dispute flow (CSS-003's
// disputeService), never by a buyer/seller PATCHing status directly.
const USER_SETTABLE_STATUSES = [
  "pending",
  "paid",
  "confirmed",
  "shipped",
  "completed",
  "cancelled",
];

async function confirmOrder(req, res, next) {
  try {
    const order = await orderModel.findById(req.params.id);
    if (!order) throw notFound("order not found");
    if (order.sellerId !== req.userId) {
      throw forbidden("only the seller can confirm this order");
    }
    orderTransitionService.assertCanParticipantUpdateStatus(order);

    if (order.status === "confirmed") {
      return res.json(order);
    }
    if (!["paid", "pending", "pending_payment"].includes(order.status)) {
      throw conflict(`cannot confirm order in status: ${order.status}`);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const changed = await tx.order.updateMany({
        where: { id: order.id, version: order.version, status: { in: ["paid", "pending", "pending_payment"] } },
        data: { status: "confirmed", version: { increment: 1 } },
      });
      if (changed.count !== 1) throw conflict("order changed — please refresh and retry");
      await tx.orderLog.create({
        data: {
          orderId: order.id,
          buyerId: order.buyerId,
          sellerId: order.sellerId,
          actorId: req.userId,
          action: "ORDER_CONFIRMED",
          detail: JSON.stringify({ confirmedAt: new Date() }),
        },
      });
      return tx.order.findUnique({ where: { id: order.id }, include: orderModel.INCLUDE });
    });

    const viewed = orderModel.view(updated);
    await chatClient.notifyOrderConfirmed(viewed);
    res.json(viewed);
  } catch (err) {
    next(err);
  }
}

async function rejectOrder(req, res, next) {
  try {
    const order = await orderModel.findById(req.params.id);
    if (!order) throw notFound("order not found");
    if (order.sellerId !== req.userId) {
      throw forbidden("only the seller can reject this order");
    }
    orderTransitionService.assertCanParticipantUpdateStatus(order);

    if (["shipped", "completed", "cancelled", "disputed"].includes(order.status)) {
      throw conflict(`cannot reject order in status: ${order.status}`);
    }

    const reason = req.body?.reason?.trim() || "ผู้ขายไม่สะดวกจัดส่งสินค้า";

    const updated = await prisma.$transaction(async (tx) => {
      const changed = await tx.order.updateMany({
        where: { id: order.id, version: order.version },
        data: { status: "cancelled", version: { increment: 1 } },
      });
      if (changed.count !== 1) throw conflict("order changed — please refresh and retry");

      await tx.payment.updateMany({
        where: { orderId: order.id, paymentStatus: "paid" },
        data: { paymentStatus: "refunded" },
      });

      await tx.payment.create({
        data: {
          orderId: order.id,
          paymentType: "REFUND",
          paymentStatus: "refunded",
          paymentAmount: order.ordersAmount,
          paidAt: new Date(),
        },
      });

      if (order.basketId) {
        await tx.basket.updateMany({
          where: { id: order.basketId },
          data: { status: "expired" },
        });
      }

      await tx.orderLog.create({
        data: {
          orderId: order.id,
          buyerId: order.buyerId,
          sellerId: order.sellerId,
          actorId: req.userId,
          action: "ORDER_REJECTED",
          detail: JSON.stringify({
            reason,
            refundAmount: Number(order.ordersAmount),
            rejectedAt: new Date(),
          }),
        },
      });

      return tx.order.findUnique({ where: { id: order.id }, include: orderModel.INCLUDE });
    });

    try {
      await productClient.setProductStatus(order.productId, "available");
    } catch (err) {
      console.error("[orderController] failed to reset product status:", err.message);
    }

    if (order.campaignId) {
      try {
        await productClient.releaseVoucher(order.campaignId, {
          userId: order.buyerId,
          orderId: order.id,
        });
      } catch (err) {
        console.error("[orderController] failed to release voucher:", err.message);
      }
    }

    const viewed = orderModel.view(updated);
    await buyerActivityClient.recordOrderActivity(viewed, "ORDER_CANCELLED", {
      initiatedBy: req.userId,
      reason,
    });
    await chatClient.notifyOrderRejected(viewed, reason);
    res.json(viewed);
  } catch (err) {
    next(err);
  }
}

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

    if (status === "confirmed" && order.sellerId === req.userId) {
      return confirmOrder(req, res, next);
    }

    if (status === "cancelled") {
      if (order.sellerId === req.userId) {
        return rejectOrder(req, res, next);
      }
      orderTransitionService.assertCanCancelOrder(order);
    }
    // TSR-02: Prevent participant updating status while order has open dispute or hold
    orderTransitionService.assertCanParticipantUpdateStatus(order);

    if (["cancelled", "completed"].includes(status)) {
      const { order: updated, event, attributionEvent } =
        await orderModel.transitionStatusWithProductSync({
          id: req.params.id,
          status,
          expectedVersion: order.version,
          expectedStatuses: [order.status],
          productSync: productSyncFor(order, status, "ORDER_STATUS"),
          actorId: req.userId,
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
        if(attributionEvent)attributionOutboxService.processEvent(attributionEvent.id).catch(err=>console.warn("attribution deferred to outbox worker:",err.message));
        await buyerActivityClient.recordOrderActivity(updated,"ORDER_COMPLETED",{initiatedBy:req.userId});
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
    if (status === "shipped") {
      if (order.sellerId !== req.userId) {
        throw forbidden("only the seller can mark this order as shipped");
      }
      if (order.status !== "confirmed") {
        throw conflict("ก่อนผู้ขายจะกดจัดส่งสินค้าได้ ต้องทำการยืนยันรับออเดอร์ก่อน");
      }
      const shipped = await shippingService.markShipped({
        orderId: order.id,
        actorId: req.userId,
        version: order.version,
        company: req.body.company,
        trackingNumber: req.body.trackingNumber,
      });
      await chatClient.notifyOrderStatusChanged(order, status);
      return res.json(shipped);
    }
    const updated = await orderModel.updateStatus(
      req.params.id,
      status,
      order.version,
      req.userId,
    );
    await chatClient.notifyOrderStatusChanged(order, status);
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
    const { auctionId, productId, sellerId, buyerId, price } = req.body;
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
