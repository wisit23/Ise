const { badRequest } = require("@reloop/shared");
const conversationService = require("./conversationService");

async function create(req, res, next) {
  try {
    const { contextType, productId } = req.body;
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
        buyerId: req.userId,
      });
    res.status(201).json(conversation);
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const conversations = await conversationService.listInbox(req.userId);
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

module.exports = { create, list, getOne };
