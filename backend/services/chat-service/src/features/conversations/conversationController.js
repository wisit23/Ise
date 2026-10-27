const { badRequest } = require("@reloop/shared");
const conversationService = require("./conversationService");

async function create(req, res, next) {
  try {
    const { contextType, productId, orderId } = req.body;
    // PRODUCT is the only client-createable context this round (CHAT-002) —
    // ORDER/SUPPORT/DIRECT rooms are opened by other services through the
    // Internal API (CHAT-005), not directly by a browser.
    if (contextType !== "PRODUCT") {
      throw badRequest(
        "Only contextType 'PRODUCT' can be created through this endpoint",
      );
    }
    const conversation =
      await conversationService.createOrOpenProductConversation({
        productId,
        orderId,
        buyerId: req.userId,
      });
    // An explicit open from a product/order restores only the caller's inbox.
    await require("./conversationModel").restoreForParticipant(conversation.id, req.userId);
    require("../../realtime/broadcast").broadcastActivity(req.userId, {
      conversationId: conversation.id,
    });
    res.status(201).json(conversation);
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const { contextType, excludeContextType } = req.query;
    const filter = {};
    if (contextType) filter.contextType = contextType;
    if (excludeContextType) filter.excludeContextType = excludeContextType;
    const conversations = await conversationService.listInbox(
      req.userId,
      filter,
    );
    res.json({ items: conversations });
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const conversation = await conversationService.getForParticipant(
      req.params.id,
      req.userId,
    );
    // Only this read path enriches: the room header needs a name to show.
    // create() deliberately doesn't — the client redirects straight to the
    // room, which fetches the enriched copy anyway.
    const [enriched] = await conversationService.withDisplayNames([
      conversation,
    ]);
    res.json(enriched);
  } catch (err) {
    next(err);
  }
}

async function hide(req, res, next) {
  try {
    const conversation = await conversationService.getForParticipant(req.params.id, req.userId);
    if (conversation.contextType === "SUPPORT" || conversation.contextType?.startsWith("DISPUTE")) {
      throw badRequest("ไม่สามารถซ่อนห้องบริการลูกค้าหรือข้อพิพาทได้");
    }
    await require("./conversationModel").hideForParticipant(conversation.id, req.userId);
    const { broadcastRealtime, userRoomName } = require("../../realtime/broadcast");
    broadcastRealtime({
      event: "conversation:hidden",
      data: { conversationId: conversation.id },
      rooms: [userRoomName(req.userId)],
    });
    res.json({ conversationId: conversation.id });
  } catch (err) {
    next(err);
  }
}

module.exports = { create, list, getOne, hide };
