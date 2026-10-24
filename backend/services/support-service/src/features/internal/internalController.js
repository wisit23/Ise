const ticketService = require("../tickets/ticketService");

// HTTP layer for calls from chat-service. The rules live in ticketService.

async function handleChatEvent(req, res, next) {
  try {
    const result = await ticketService.recordChatEvent(req.body);
    res.status(result.alreadyRecorded ? 200 : 201).json(result);
  } catch (error) {
    next(error);
  }
}

async function chatAccess(req, res, next) {
  try {
    res.json(await ticketService.getChatAccess({
      ticketId: req.params.id,
      userId: req.params.userId,
      role: req.query.role,
    }));
  } catch (err) {
    next(err);
  }
}

module.exports = { handleChatEvent, chatAccess };
