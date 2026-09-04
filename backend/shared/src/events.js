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
  // Not yet published anywhere — reserved here as the documented contract
  // ahead of CHAT-006, which wires chat-service's realtime layer to
  // actually publish these on Redis after a successful MongoDB write (see
  // docs/featureplan/chat/plan.md's Redis-is-delivery-only-not-source-of-
  // truth constraint). Declared now, alongside the Internal API that
  // creates the underlying data (CHAT-005), so the contract other services
  // can build against is fixed in one place from the start.
  CHAT_CONVERSATION_OPENED: "chat.conversation.opened", // { conversationId, contextType, contextId, participantUserIds }
  CHAT_MESSAGE_CREATED: "chat.message.created", // { conversationId, messageId, senderId, type }
};

module.exports = { EVENTS };
