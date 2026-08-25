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

async function updateStatus(req, res, next) {
  try {
    const order = await orderModel.findById(req.params.id);
    if (!order) throw notFound("order not found");
    if (order.buyerId !== req.userId && order.sellerId !== req.userId) {
      throw forbidden("you are not part of this order");
    }

    const { status } = req.body;
    if (!orderModel.VALID_STATUSES.includes(status)) {
      throw badRequest(
        `status must be one of ${orderModel.VALID_STATUSES.join(", ")}`,
      );
    }

    const updated = await orderModel.updateStatus(req.params.id, status);

    if (status === "cancelled") {
      if (order.reservationId) {
        await productClient.releaseProductReservation(
          order.productId,
          order.reservationId,
        );
      } else {
        await productClient.setProductStatus(order.productId, "available");
      }
    }
    if (status === "completed") {
      await productClient.setProductStatus(order.productId, "sold");
    }

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
    if (!["pending", "pending_payment"].includes(order.status)) {
      throw badRequest(
        `order is already ${order.status}, it cannot be paid again`,
      );
    }

    if (
      order.reservationExpiresAt &&
      order.reservationExpiresAt <= new Date()
    ) {
      await orderModel.updateStatus(req.params.id, "cancelled");
      if (order.reservationId) {
        await productClient.releaseProductReservation(
          order.productId,
          order.reservationId,
        );
      }
      throw conflict("reservation has expired");
    }

    if (order.reservationId) {
      await productClient.completeProductReservation(
        order.productId,
        order.reservationId,
      );
    } else {
      await productClient.setProductStatus(order.productId, "sold");
    }
    const updated = await orderModel.updateStatus(req.params.id, "completed");

    res.json(updated);
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
