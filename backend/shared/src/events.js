// Redis pub/sub channel names shared across services.
// Keep this the single source of truth for event names + payload shape comments.

const EVENTS = {
  ORDER_PAID: "order.paid", // { orderId, productId, buyerId, sellerId }
  ORDER_COMPLETED: "order.completed", // { orderId, productId, buyerId, sellerId, price }
  ORDER_CANCELLED: "order.cancelled", // { orderId, productId, reason }
  CART_EXPIRED: "cart.expired", // { productId, buyerId }
  PRODUCT_SOLD: "product.sold", // { productId }
  KYC_APPROVED: "kyc.approved", // { userId, sellerId }
  KYC_REJECTED: "kyc.rejected", // { userId, reason }
  DISPUTE_OPENED: "dispute.opened", // { orderId, disputeId }
};

module.exports = { EVENTS };
