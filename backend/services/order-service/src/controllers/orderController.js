const {
  badRequest,
  notFound,
  forbidden,
  parsePagination,
  paginatedResponse,
} = require("@reloop/shared");
const orderModel = require("../models/orderModel");
const productClient = require("../services/productClient");

async function create(req, res, next) {
  let reservation;
  try {
    const { productId } = req.body;
    if (!productId) throw badRequest("productId is required");

    reservation = await productClient.reserveProduct(productId, req.userId);
    const product = reservation.product;

    const order = await orderModel.create({
      buyerId: req.userId,
      sellerId: product.sellerId,
      productId: product.id,
      productTitle: product.title,
      price: product.price,
      reservationId: reservation.reservationId,
      reservationExpiresAt: reservation.expiresAt,
    });

    res.status(201).json(order);
  } catch (err) {
    if (reservation) {
      try {
        await productClient.releaseReservation(
          req.body.productId,
          reservation.reservationId,
          req.userId,
        );
      } catch (releaseError) {
        console.error("failed to compensate reservation", releaseError);
      }
    }
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
    if (["cancelled", "completed"].includes(status) && !order.reservationId) {
      throw badRequest("order has no active reservation");
    }

    if (status === "cancelled") {
      await productClient.releaseReservation(
        order.productId,
        order.reservationId,
        order.buyerId,
      );
    }
    if (status === "completed") {
      await productClient.confirmReservation(
        order.productId,
        order.reservationId,
        order.buyerId,
      );
    }

    const updated = await orderModel.updateStatus(req.params.id, status);

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

/** Mock checkout: buyer pays for a locked (pending) cart item. Moves the reserved product to sold. */
async function pay(req, res, next) {
  try {
    const order = await orderModel.findById(req.params.id);
    if (!order) throw notFound("order not found");
    if (order.buyerId !== req.userId) {
      throw forbidden("only the buyer can pay for this order");
    }
    if (order.status !== "pending") {
      throw badRequest(
        `order is already ${order.status}, it cannot be paid again`,
      );
    }
    if (!order.reservationId) {
      throw badRequest("order has no active reservation");
    }

    await productClient.confirmReservation(
      order.productId,
      order.reservationId,
      order.buyerId,
    );
    const updated = await orderModel.updateStatus(req.params.id, "completed");

    res.json(updated);
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
};
