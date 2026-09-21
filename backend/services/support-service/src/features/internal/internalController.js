const { badRequest } = require("@reloop/shared");
const ticketModel = require("../tickets/ticketModel");

async function handleChatEvent(req, res, next) {
  try {
    const data = req.body;
    if (!data || typeof data !== "object") {
      throw badRequest("body is required");
    }

    // Accept the current flat contract and the original nested contract so
    // queued events created during a rolling deployment remain deliverable.
    const message = data.message || {};
    const chatMessageId =
      data.chatMessageId || data.messageId || message.id || data.id;
    const ticketId =
      data.ticketId || data.contextId || message.ticketId || message.contextId;
    const conversationId = data.conversationId || message.conversationId;
    const authorId =
      data.authorId || data.senderId || message.senderId || message.authorId;
    const authorRole =
      data.authorRole ||
      data.senderRole ||
      message.senderRole ||
      message.authorRole;
    const body = data.body ?? message.body;
    const isInternal = Boolean(
      data.isInternal ??
        (data.visibility === "INTERNAL" ||
          message.visibility === "INTERNAL"),
    );
    const createdAt = data.createdAt || message.createdAt;

    if (typeof chatMessageId !== "string" || !chatMessageId.trim()) {
      throw badRequest("chatMessageId is required");
    }
    if (!ticketId && !conversationId) {
      throw badRequest("ticketId or conversationId is required");
    }
    if (typeof authorId !== "string" || !authorId.trim()) {
      throw badRequest("authorId is required");
    }
    if (typeof authorRole !== "string" || !authorRole.trim()) {
      throw badRequest("authorRole is required");
    }
    if (createdAt != null && Number.isNaN(new Date(createdAt).getTime())) {
      throw badRequest("createdAt must be a valid date");
    }

    const result = await ticketModel.recordChatMessage({
      ticketId,
      conversationId,
      chatMessageId: chatMessageId.trim(),
      authorId: authorId.trim(),
      authorRole: authorRole.trim(),
      body,
      isInternal,
      createdAt,
    });
    res.status(result.alreadyRecorded ? 200 : 201).json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = { handleChatEvent };
