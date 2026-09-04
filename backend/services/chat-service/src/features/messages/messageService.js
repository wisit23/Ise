const { badRequest, AppError } = require("@reloop/shared");
const prisma = require("../../models/prismaClient");
const conversationService = require("../conversations/conversationService");
const conversationModel = require("../conversations/conversationModel");
const messageModel = require("./messageModel");
const { isValidCursor } = require("./cursor");

const EPOCH = new Date(0);

/**
 * Sends a TEXT message. Authorization is re-derived from the database on
 * every call (via getForParticipant), never trusted from a prior request —
 * and the Message write + Conversation.lastMessageAt/lastMessagePreview
 * update happen in one transaction so a reader never observes an inbox
 * preview that doesn't match any message that actually exists (or vice
 * versa). This is also why CHAT-001 insists on a replica set: Prisma's
 * MongoDB $transaction requires one.
 *
 * Returns the conversation alongside the message because the caller has to
 * broadcast to every PARTICIPANT's own socket room (not just the
 * conversation room) — see broadcast.js. Handing back the conversation this
 * function already loaded avoids the controller re-reading it just to learn
 * who was in it.
 */
async function sendMessage(conversationId, senderId, body) {
  if (typeof body !== "string" || !body.trim()) {
    throw badRequest("body is required");
  }

  const conversation = await conversationService.getForParticipant(
    conversationId,
    senderId,
  );
  if (conversation.status === "LOCKED") {
    throw new AppError(409, "This conversation is locked");
  }

  const sender = conversation.participants.find((p) => p.userId === senderId);
  const trimmed = body.trim();

  const message = await messageModel.createAndTouch({
    conversationId,
    senderId,
    senderRole: sender.role,
    type: "TEXT",
    body: trimmed,
  });
  return { message, conversation };
}

async function listMessages(conversationId, userId, before, limit) {
  // Re-uses the exact same authorization check as reading the conversation
  // itself — a single choke point, not a second copy of the participant
  // logic that could drift out of sync.
  await conversationService.getForParticipant(conversationId, userId);
  if (before !== undefined && !isValidCursor(before)) {
    throw badRequest("before must be a valid message id");
  }
  return messageModel.listPage(conversationId, before, limit);
}

async function markRead(conversationId, userId) {
  const conversation = await conversationService.getForParticipant(
    conversationId,
    userId,
  );
  const now = new Date();
  // Composite (embedded) list fields in Prisma's MongoDB connector have no
  // per-element update — the whole array is replaced via `set`, so this
  // reads the array, patches the one matching participant in JS, and writes
  // the full array back.
  const updatedParticipants = conversation.participants.map((p) =>
    p.userId === userId ? { ...p, lastReadAt: now } : p,
  );
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { participants: { set: updatedParticipants } },
  });
  return { lastReadAt: now };
}

/**
 * Unread total across every conversation the user is part of. One query per
 * conversation (not a single aggregate) because the "unread since" cutoff is
 * a different value per conversation (that participant's own lastReadAt) —
 * fine at this app's conversation-per-user scale, not attempted to be
 * cleverer than that.
 */
async function unreadCount(userId) {
  const conversations = await conversationModel.listForParticipant(userId);
  const counts = await Promise.all(
    conversations.map((c) => {
      const participant = c.participants.find((p) => p.userId === userId);
      const since = participant?.lastReadAt || participant?.joinedAt || EPOCH;
      return messageModel.countUnread({ conversationId: c.id, userId, since });
    }),
  );
  return counts.reduce((a, b) => a + b, 0);
}

module.exports = { sendMessage, listMessages, markRead, unreadCount };
