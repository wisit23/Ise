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
const chatClient = require("../../auctions/chatClient");
const productModel = require("../../../models/productModel");
const {
  assertReviewCommentAllowed,
} = require("../services/reviewCommentPolicy");

const MAX_REVIEW_MEDIA = 8;

function reviewFields({ rating, comment, media }) {
  const reviewComment = comment ?? "";
  assertReviewCommentAllowed(reviewComment);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw badRequest("rating must be a whole number from 1 to 5");
  }

  let normalizedMedia = [];
  if (media !== undefined) {
    if (!Array.isArray(media)) {
      throw badRequest("media must be an array");
    }
    if (media.length > MAX_REVIEW_MEDIA) {
      throw badRequest(`media cannot contain more than ${MAX_REVIEW_MEDIA} items`);
    }
    normalizedMedia = media.map((item) => {
      if (!item || typeof item.url !== "string" || !item.url.trim()) {
        throw badRequest("each media item must have a valid url");
      }
      const url = item.url.trim();
      if (!url.startsWith("/review-uploads/")) {
        throw badRequest("review media must be uploaded through the review uploader");
      }
      const type = item.type === "video" ? "video" : "image";
      return { url, type };
    });
  }

  return { rating, comment: reviewComment, media: normalizedMedia };
}

async function update(req, res, next) {
  try {
    const existing = await reviewModel.findById(req.params.id);
    if (!existing) throw notFound("review not found");
    if (existing.buyerId !== req.userId) {
      throw forbidden("only the author can edit this review");
    }
    // A review taken down by Trust & Safety stays down; editing must not revive it.
    if (existing.removed) throw conflict("รีวิวนี้ถูกลบโดยทีม Trust & Safety จึงแก้ไขไม่ได้");
    const fields = reviewFields({
      rating: req.body.rating === undefined ? existing.rating : req.body.rating,
      comment:
        req.body.comment === undefined ? existing.comment : req.body.comment,
      media: req.body.media === undefined ? existing.media : req.body.media,
    });
    const review = await reviewModel.update(existing.id, req.userId, {
      ...fields,
      comment: fields.comment.slice(0, 1000),
    });
    res.json(review);
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { orderId, rating, comment, media } = req.body;
    const { comment: reviewComment, media: normalizedMedia } = reviewFields({
      rating, comment, media,
    });
    if (!orderId) throw badRequest("orderId is required");
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
      comment: reviewComment.slice(0, 1000),
      media: normalizedMedia,
    });

    try {
      let productTitle = "สินค้าของคุณ";
      if (order.productId) {
        try {
          const prod = await productModel.findById(order.productId);
          if (prod?.title) productTitle = prod.title;
        } catch {
          // ignore product lookup failure
        }
      }
      const commentSnippet = reviewComment
        ? ` "${reviewComment.slice(0, 50)}${reviewComment.length > 50 ? "..." : ""}"`
        : "";

      chatClient.sendSystemNotification({
        userId: order.sellerId,
        type: "REVIEW",
        title: "มีคนคอมเมนต์สินค้าของคุณ",
        message: `มีลูกค้าแสดงความคิดเห็น/รีวิวสินค้า '${productTitle}' ให้คะแนน ${rating}/5${commentSnippet ? `: ${commentSnippet}` : ""}`,
        link: order.productId ? `/products/${order.productId}` : "/orders",
        entityId: `review:${review.id}`,
        metadata: {
          reviewId: review.id,
          orderId: order.id,
          productId: order.productId,
          rating,
          comment: reviewComment,
        },
      }).catch(() => {});
    } catch (notifyErr) {
      console.error("[reviewController] notify review failed:", notifyErr.message);
    }

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

module.exports = { create, update, bySeller, summaryBySeller, byOrder, mine };
