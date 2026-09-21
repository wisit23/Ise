const {
  badRequest,
  notFound,
  forbidden,
  conflict,
  parsePagination,
  paginatedResponse,
} = require("@reloop/shared");
const reviewModel = require("../models/reviewModel");
const orderClient = require("../services/orderClient");

const MAX_REVIEW_MEDIA = 8;

async function create(req, res, next) {
  try {
    const { orderId, rating, comment, media } = req.body;
    if (!orderId) throw badRequest("orderId is required");
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw badRequest("rating must be a whole number from 1 to 5");
    }

    let normalizedMedia = [];
    if (media !== undefined) {
      if (!Array.isArray(media)) {
        throw badRequest("media must be an array");
      }
      if (media.length > MAX_REVIEW_MEDIA) {
        throw badRequest(
          `media cannot contain more than ${MAX_REVIEW_MEDIA} items`,
        );
      }
      normalizedMedia = media.map((item) => {
        if (!item || typeof item.url !== "string" || !item.url.trim()) {
          throw badRequest("each media item must have a valid url");
        }
        const type = item.type === "video" ? "video" : "image";
        return { url: item.url.trim(), type };
      });
    }

    const order = await orderClient.getOrder(orderId);
    if (!order) throw notFound("order not found");
    if (order.buyerId !== req.userId) {
      throw forbidden("only the buyer of this order can review it");
    }
    if (order.status !== "completed") {
      throw badRequest("you can only review an order after it is completed");
    }

    const existing = await reviewModel.findByOrderId(orderId);
    if (existing) throw conflict("this order has already been reviewed");

    const review = await reviewModel.create({
      orderId,
      buyerId: order.buyerId,
      sellerId: order.sellerId,
      productId: order.productId || null,
      rating,
      comment: (comment || "").slice(0, 1000),
      media: normalizedMedia,
    });
    res.status(201).json(review);
  } catch (err) {
    next(err);
  }
}

async function bySeller(req, res, next) {
  try {
    const pagination = parsePagination(req.query, 10);
    const { items, total, averageRating } = await reviewModel.listBySeller(
      req.params.sellerId,
      { skip: pagination.skip, take: pagination.take },
    );
    res.json({ ...paginatedResponse(items, total, pagination), averageRating });
  } catch (err) {
    next(err);
  }
}

async function summaryBySeller(req, res, next) {
  try {
    const summary = await reviewModel.summaryBySeller(req.params.sellerId);
    res.json(summary);
  } catch (err) {
    next(err);
  }
}

async function byOrder(req, res, next) {
  try {
    const review = await reviewModel.findByOrderId(req.params.orderId);
    res.json({ review: review || null });
  } catch (err) {
    next(err);
  }
}

async function mine(req, res, next) {
  try {
    const pagination = parsePagination(req.query, 10);
    const { items, total } = await reviewModel.listByBuyer(req.userId, {
      skip: pagination.skip,
      take: pagination.take,
    });
    res.json(paginatedResponse(items, total, pagination));
  } catch (err) {
    next(err);
  }
}

module.exports = { create, bySeller, summaryBySeller, byOrder, mine };
