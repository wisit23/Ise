// Pure function — the whole create-or-open mechanism (CHAT-002) hinges on
// this producing the exact same string for the exact same logical
// conversation every time, so two concurrent "Contact Seller" clicks race on
// Conversation.contextKey's unique index instead of on an application-level
// check-then-create (which is not actually atomic — see conversationService.js).
const CONTEXT_TYPES = ["PRODUCT", "ORDER", "SUPPORT", "DIRECT"];

function buildContextKey(contextType, params = {}) {
  switch (contextType) {
    case "PRODUCT": {
      const { productId, buyerId } = params;
      if (!productId || !buyerId) {
        throw new Error("PRODUCT context requires both productId and buyerId");
      }
      return `PRODUCT:${productId}:${buyerId}`;
    }
    case "ORDER": {
      const { orderId } = params;
      if (!orderId) throw new Error("ORDER context requires orderId");
      return `ORDER:${orderId}`;
    }
    case "SUPPORT": {
      const { ticketId } = params;
      if (!ticketId) throw new Error("SUPPORT context requires ticketId");
      return `SUPPORT:${ticketId}`;
    }
    case "DIRECT": {
      const { userIdA, userIdB } = params;
      if (!userIdA || !userIdB) {
        throw new Error("DIRECT context requires userIdA and userIdB");
      }
      // Sorted so the two participants always compute the same key
      // regardless of who initiated — "A messages B" and "B messages A"
      // must collide on the same conversation.
      const [a, b] = [userIdA, userIdB].sort();
      return `DIRECT:${a}:${b}`;
    }
    default:
      throw new Error(`Unknown contextType: ${contextType}`);
  }
}

module.exports = { buildContextKey, CONTEXT_TYPES };
