const { badRequest } = require("@reloop/shared");
const { buildContextKey } = require("../conversations/contextKey");

/**
 * Maps a single `contextId` (what an internal caller naturally has — an
 * orderId, a ticketId) onto contextKey.js's per-type param shape. Only
 * ORDER and SUPPORT are supported here — both are naturally "one foreign
 * id" contexts. PRODUCT (needs productId + buyerId) and DIRECT (needs two
 * user ids) don't fit a single `contextId` and aren't created through the
 * Internal API this round; PRODUCT stays public-only (conversationService.js).
 */
function contextKeyForInternalContextId(contextType, contextId) {
  if (!contextId) throw badRequest("contextId is required");
  switch (contextType) {
    case "ORDER":
      return buildContextKey("ORDER", { orderId: contextId });
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
