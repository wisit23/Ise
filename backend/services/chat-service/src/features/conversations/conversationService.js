const { AppError, notFound, badRequest } = require("@reloop/shared");
const { buildContextKey } = require("./contextKey");
const conversationModel = require("./conversationModel");
const productClient = require("../../services/productClient");
const authClient = require("../../services/authClient");

const DUPLICATE_KEY_ERROR = "P2002";

/**
 * create-or-open for a PRODUCT-context conversation (Buyer contacting a
 * Seller about a listing). The buyer is always the caller (`req.userId`) —
 * the client never gets to say who the buyer is. The seller is always
 * resolved server-side from product-service — the client never gets to say
 * who the seller is either, so a forged `sellerId` in the request body has
 * no effect at all (it's simply never read).
 */
async function createOrOpenProductConversation({ productId, buyerId }) {
  if (!productId) throw badRequest("productId is required");

  const product = await productClient.getProduct(productId);
  if (!product) throw notFound("Product not found");

  const sellerId = product.sellerId;
  if (!sellerId) {
    throw new AppError(502, "product-service returned no sellerId");
  }
  if (sellerId === buyerId) {
    throw badRequest("Cannot start a conversation about your own listing");
  }

  const contextKey = buildContextKey("PRODUCT", { productId, buyerId });
  const now = new Date();

  try {
    return await conversationModel.create({
      contextType: "PRODUCT",
      contextId: productId,
      contextKey,
      createdBy: buyerId,
      participants: [
        {
          userId: buyerId,
          role: "BUYER",
          joinedAt: now,
          lastReadAt: null,
          leftAt: null,
        },
        {
          userId: sellerId,
          role: "SELLER",
          joinedAt: now,
          lastReadAt: null,
          leftAt: null,
        },
      ],
    });
  } catch (err) {
    // Two concurrent "Contact Seller" clicks (or a retried request) race on
    // Conversation.contextKey's unique index. This is not a failure case —
    // it IS the create-or-open semantics — so on a duplicate key we fetch
    // and return the conversation the other request just created instead of
    // propagating the error.
    if (err.code === DUPLICATE_KEY_ERROR) {
      const existing = await conversationModel.findByContextKey(contextKey);
      if (existing) return existing;
    }
    throw err;
  }
}

/**
 * Attaches `displayName` to every participant of the given conversations.
 *
 * Done here (once, for the whole batch) rather than in the browser: the
 * frontend has no user-lookup endpoint to call at all, which is the point —
 * see authClient's comment. Names are resolved only for participants of
 * conversations the caller is already authorized to read.
 *
 * Degrades silently: authClient never throws, so a participant with no
 * resolved name keeps `displayName: null` and the UI falls back to a generic
 * label instead of the request failing.
 */
async function withDisplayNames(conversations) {
  const ids = conversations.flatMap((c) =>
    (c.participants || []).map((p) => p.userId),
  );
  const names = await authClient.getDisplayNames(ids);

  return conversations.map((conversation) => ({
    ...conversation,
    participants: (conversation.participants || []).map((participant) => ({
      ...participant,
      displayName: names.get(participant.userId) || null,
    })),
  }));
}

function isParticipant(conversation, userId) {
  return conversation.participants.some(
    (p) => p.userId === userId && !p.leftAt,
  );
}

async function getForParticipant(conversationId, userId) {
  const conversation = await conversationModel.findById(conversationId);
  if (!conversation) throw notFound("Conversation not found");
  if (!isParticipant(conversation, userId)) {
    throw new AppError(403, "Forbidden");
  }
  return conversation;
}

async function listInbox(userId) {
  const conversations = await conversationModel.listForParticipant(userId);
  return withDisplayNames(conversations);
}

module.exports = {
  createOrOpenProductConversation,
  getForParticipant,
  withDisplayNames,
  listInbox,
  isParticipant,
};
