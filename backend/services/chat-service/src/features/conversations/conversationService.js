const { AppError, notFound, badRequest } = require("@reloop/shared");
const {
  buildContextKey,
  conversationIdForContextKey,
} = require("./contextKey");
const conversationModel = require("./conversationModel");
const productClient = require("../../services/productClient");
const authClient = require("../../services/authClient");
const orderClient = require("../../services/orderClient");
const { getCaseAccess } = require("../../services/caseAccessClient");

const DUPLICATE_KEY_ERROR = "P2002";

/**
 * create-or-open for a PRODUCT-context conversation (Buyer contacting a
 * Seller about a listing). The buyer is always the caller (`req.userId`) —
 * the client never gets to say who the buyer is. The seller is always
 * resolved server-side from product-service — the client never gets to say
 * who the seller is either, so a forged `sellerId` in the request body has
 * no effect at all (it's simply never read).
 */
async function createOrOpenProductConversation({ productId, buyerId, orderId }) {
  if (!productId) throw badRequest("productId is required");
  if (orderId !== undefined && (typeof orderId !== "string" || !orderId.trim())) {
    throw badRequest("orderId must be a non-empty string");
  }

  const product = await productClient.getProduct(productId);
  if (!product) throw notFound("Product not found");

  const sellerId = product.sellerId;
  if (!sellerId) {
    throw new AppError(502, "product-service returned no sellerId");
  }
  if (sellerId === buyerId) {
    throw badRequest("Cannot start a conversation about your own listing");
  }

  // The order ID is only a reference: ownership and listing identity must
  // come from order-service, never from buyer/seller fields in the request.
  if (orderId !== undefined) {
    const order = await orderClient.getOrder(orderId);
    if (
      !order ||
      order.buyerId !== buyerId ||
      order.productId !== productId ||
      order.sellerId !== sellerId
    ) {
      throw new AppError(403, "คุณไม่มีสิทธิ์ติดต่อผู้ขายผ่านคำสั่งซื้อนี้");
    }
  }

  const contextKey = buildContextKey("PRODUCT", { productId, buyerId });
  const existing = await conversationModel.findByContextKey(contextKey);
  if (existing) return existing;
  if (product.status === "sold" && orderId === undefined) {
    throw badRequest("ไม่สามารถเริ่มแชทใหม่สำหรับสินค้าที่ขายแล้ว");
  }
  const now = new Date();

  try {
    return await conversationModel.create({
      id: conversationIdForContextKey(contextKey),
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
const SYSTEM_DISPLAY_NAMES = {
  system: "ระบบฝ่ายการตลาด",
  "system-marketing": "ระบบฝ่ายการตลาด",
};

async function withDisplayNames(conversations) {
  const ids = conversations
    .flatMap((c) => (c.participants || []).map((p) => p.userId))
    .filter((id) => !SYSTEM_DISPLAY_NAMES[id]);
  const names = await authClient.getDisplayNames(ids);

  return conversations.map((conversation) => ({
    ...conversation,
    participants: (conversation.participants || []).map((participant) => {
      const isAuctionSystem =
        conversation.contextType === "AUCTION" &&
        (participant.role === "SYSTEM" ||
          Boolean(SYSTEM_DISPLAY_NAMES[participant.userId]));
      const resolvedName =
        (isAuctionSystem
          ? SYSTEM_DISPLAY_NAMES[participant.userId] || "ระบบฝ่ายการตลาด"
          : null) ||
        SYSTEM_DISPLAY_NAMES[participant.userId] ||
        names.get(participant.userId) ||
        null;
      return {
        ...participant,
        displayName: resolvedName,
      };
    }),
  }));
}

function isParticipant(conversation, userId) {
  return conversation.participants.some(
    (p) => p.userId === userId && !p.leftAt,
  );
}

async function getForParticipant(conversationId, userId, { write = false } = {}) {
  const conversation = await conversationModel.findById(conversationId);
  if (!conversation) throw notFound("Conversation not found");
  if (!isParticipant(conversation, userId)) {
    throw new AppError(403, "Forbidden");
  }
  const participant = conversation.participants.find((p) => p.userId === userId && !p.leftAt);
  const access = await getCaseAccess(conversation, userId, participant.role);
  if (!access.allowed || (write && !access.writable)) {
    throw new AppError(403, "Case chat access was revoked or is read-only");
  }
  return conversation;
}

async function listInbox(userId, filter = {}) {
  const conversations = await conversationModel.listForParticipant(userId, filter);
  const accessible = await Promise.all(conversations.map(async (conversation) => {
    if (conversation.contextType?.startsWith("DISPUTE")) return null;
    const participant = conversation.participants.find((p) => p.userId === userId && !p.leftAt);
    if (!participant) return null;
    const access = await getCaseAccess(conversation, userId, participant.role);
    return access.allowed ? conversation : null;
  }));
  return withDisplayNames(accessible.filter(Boolean));
}

module.exports = {
  createOrOpenProductConversation,
  getForParticipant,
  withDisplayNames,
  listInbox,
  isParticipant,
};
