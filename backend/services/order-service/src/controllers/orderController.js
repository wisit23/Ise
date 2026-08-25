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
  try {
    const { productId } = req.body;
    if (!productId) throw badRequest("productId is required");

    const product = await productClient.getProduct(productId);
    if (!product) throw notFound("product not found");
    if (product.status !== "available") {
      throw badRequest("product is no longer available");
    }
    if (product.sellerId === req.userId) {
      throw badRequest("you cannot buy your own listing");
    }

    const order = await orderModel.create({
      buyerId: req.userId,
      sellerId: product.sellerId,
      productId: product.id,
      productTitle: product.title,
      price: product.price,
    });

    await productClient.setProductStatus(product.id, "reserved");

    res.status(201).json(order);
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
      await productClient.setProductStatus(order.productId, "available");
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

    const updated = await orderModel.updateStatus(req.params.id, "completed");
    await productClient.setProductStatus(order.productId, "sold");

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
