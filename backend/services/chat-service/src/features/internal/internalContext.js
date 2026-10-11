const { badRequest } = require("@reloop/shared");
const { buildContextKey } = require("../conversations/contextKey");

/**
 * Maps a single `contextId` (what an internal caller naturally has — an
 * orderId, a ticketId) onto contextKey.js's per-type param shape. Only
 * ORDER, DISPUTE and SUPPORT are supported here — each has "one foreign
 * id" contexts. PRODUCT (needs productId + buyerId) and DIRECT (needs two
 * user ids) don't fit a single `contextId` and aren't created through the
 * Internal API this round; PRODUCT stays public-only (conversationService.js).
 */
function contextKeyForInternalContextId(contextType, contextId, participants = []) {
  if (!contextId) throw badRequest("contextId is required");
  switch (contextType) {
    case "PRODUCT": {
      const buyer = participants.find((p) => p.role === "BUYER");
      if (!buyer || !buyer.userId) {
        throw badRequest("PRODUCT context requires a participant with role BUYER");
      }
      return buildContextKey("PRODUCT", {
        productId: contextId,
        buyerId: buyer.userId,
      });
    }
    case "ORDER":
      return buildContextKey("ORDER", { orderId: contextId });
    case "DISPUTE":
      return buildContextKey("DISPUTE", { disputeId: contextId });
    case "DISPUTE_BUYER":
    case "DISPUTE_SELLER":
      return buildContextKey(contextType, { disputeId: contextId });
    case "SUPPORT":
      return buildContextKey("SUPPORT", { ticketId: contextId });
    case "AUCTION": {
      const parts = contextId.split(":");
      if (parts.length < 2 || !parts[0] || !parts[1]) {
        throw badRequest("AUCTION contextId requires 'roundId:userId'");
      }
      return buildContextKey("AUCTION", {
        roundId: parts[0],
        userId: parts[1],
      });
    }
    default:
      throw badRequest(
        `Internal API does not support creating contextType '${contextType}' from a single contextId`,
      );
  }
}

module.exports = { contextKeyForInternalContextId };
