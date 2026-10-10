const { createHash } = require("node:crypto");
const { AppError, badRequest, notFound } = require("@reloop/shared");
const prisma = require("../../models/prismaClient");
const conversationService = require("../conversations/conversationService");
const messageModel = require("../messages/messageModel");
const broadcast = require("../../realtime/broadcast");
const { syncSupportMessage } = require("../sync/supportSyncWorker");

function keyedId(conversationId, key) {
  return createHash("sha256").update(`${conversationId}:${key}`).digest("hex").slice(0, 24);
}
function checkKey(key) {
  if (key !== undefined && (typeof key !== "string" || !key.trim() || key.length > 128))
    throw badRequest("eventKey must be a non-empty string of at most 128 characters");
}

// Separate from SYSTEM notifications: human replies always enforce current case access.
async function reply(req, res, next) {
  try {
    const { senderId, body, visibility = "ALL", eventKey } = req.body;
    if (typeof senderId !== "string" || !senderId || typeof body !== "string" || !body.trim())
      throw badRequest("senderId and body are required");
    if (!["ALL", "INTERNAL"].includes(visibility)) throw badRequest("invalid visibility");
    checkKey(eventKey);
    const conversation = await conversationService.getForParticipant(req.params.id, senderId);
    if (conversation.contextType !== "SUPPORT") throw badRequest("support conversation required");
    const sender = conversation.participants.find((p) => p.userId === senderId && !p.leftAt);
    const staff = ["AGENT", "ADMIN"].includes(sender.role);
    if (visibility === "INTERNAL" && !staff) throw new AppError(403, "Only staff can write internal notes");
    if (sender.role === "ADMIN" && visibility === "ALL") throw new AppError(403, "Admin audit is read-only");
    const messageId = eventKey ? keyedId(conversation.id, `reply:${senderId}:${eventKey}`) : undefined;
    const existing = messageId && await prisma.message.findUnique({ where: { id: messageId } });
    const checkExisting = (message) => {
      if (message.senderId !== senderId || message.body !== body.trim() || message.visibility !== visibility)
        throw new AppError(409, "Idempotency key was used for a different reply");
      return res.status(200).json(message);
    };
    if (existing) return checkExisting(existing);
    if (conversation.status === "LOCKED") throw new AppError(409, "This conversation is locked");
    // An ADMIN can add an internal audit note, but never a customer-facing reply.
    if (sender.role !== "ADMIN") await conversationService.getForParticipant(conversation.id, senderId, { write: true });
    let message;
    try {
      message = await messageModel.createAndTouch({ messageId, conversationId: conversation.id,
        senderId, senderRole: sender.role, type: "TEXT", body: body.trim(), visibility, syncStatus: "PENDING" });
    } catch (error) {
      if (messageId && error.code === "P2002") {
        const duplicate = await prisma.message.findUnique({ where: { id: messageId } });
        if (duplicate) return checkExisting(duplicate);
      }
      throw error;
    }
    syncSupportMessage(conversation, message);
    broadcast.broadcastMessage(conversation, message);
    res.status(201).json(message);
  } catch (error) { next(error); }
}

// Migration-only, internal-token-gated path. Imports historical messages without
// reopening closed rooms, broadcasting old messages, or overwriting current previews.
async function importMessage(req, res, next) {
  try {
    const conversation = await prisma.conversation.findUnique({ where: { id: req.params.id } });
    if (!conversation) throw notFound("Conversation not found");
    const data = req.body;
    if (conversation.contextType !== "SUPPORT" || conversation.contextId !== data.ticketId)
      throw badRequest("Ticket and conversation correlation mismatch");
    const at = new Date(data.createdAt);
    if (!data.sourceId || typeof data.sourceId !== "string" || Number.isNaN(+at) || !data.authorId ||
      !["REQUESTER", "AGENT", "SYSTEM"].includes(data.authorRole) || typeof data.body !== "string" || typeof data.isInternal !== "boolean")
      throw badRequest("Invalid legacy message");
    if (data.chatMessageId && !/^[a-f\d]{24}$/i.test(data.chatMessageId)) throw badRequest("Invalid chatMessageId");
    const id = data.chatMessageId || keyedId(conversation.id, `legacy-support:${data.sourceId}`);
    const visibility = data.isInternal ? "INTERNAL" : "ALL";
    const verify = (message) => {
      if (message.conversationId !== conversation.id || message.senderId !== data.authorId ||
        message.visibility !== visibility || (!data.chatMessageId && (message.body !== data.body || +new Date(message.createdAt) !== +at)))
        throw new AppError(409, "Imported message differs from Chat record");
      return res.status(200).json(message);
    };
    const existing = await prisma.message.findUnique({ where: { id } });
    if (existing) return verify(existing);
    // A mirrored Chat ID must already exist. Do not fabricate lost attachment messages from text mirrors.
    if (data.chatMessageId) throw new AppError(409, "Original mirrored Chat message is missing; restore it before migration");
    let message;
    try {
      message = await prisma.message.create({ data: { id, conversationId: conversation.id,
        senderId: data.authorId, senderRole: data.authorRole === "REQUESTER" ? "BUYER" : data.authorRole,
        type: "TEXT", body: data.body, visibility, createdAt: at, deletedAt: null,
        payload: { legacySupportMessageId: data.sourceId }, syncStatus: "PENDING", syncAttempts: 0 } });
    } catch (error) {
      if (error.code === "P2002") {
        const duplicate = await prisma.message.findUnique({ where: { id } });
        if (duplicate) return verify(duplicate);
      }
      throw error;
    }
    res.status(201).json(message);
  } catch (error) { next(error); }
}

module.exports = { reply, importMessage, keyedId };
