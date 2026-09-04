const { badRequest, notFound } = require("@reloop/shared");
const prisma = require("../../models/prismaClient");
const conversationModel = require("../conversations/conversationModel");
const messageModel = require("../messages/messageModel");
const { contextKeyForInternalContextId } = require("./internalContext");
const broadcast = require("../../realtime/broadcast");

const DUPLICATE_KEY_ERROR = "P2002";
const VALID_STATUSES = ["ACTIVE", "ARCHIVED", "LOCKED"];

/**
 * create-or-open for ORDER/SUPPORT contexts, callable by other services.
 * Unlike the public PRODUCT path (conversationService.js), the caller here
 * IS trusted to say who the participants are — requireInternalToken already
 * gated this route, so there's no user JWT to derive identity from the way
 * the public endpoint does with req.userId.
 */
async function createConversation(req, res, next) {
  try {
    const { contextType, contextId, participants, createdBy } = req.body;
    if (!Array.isArray(participants) || participants.length === 0) {
      throw badRequest("participants must be a non-empty array");
    }
    for (const p of participants) {
      if (!p.userId || !p.role) {
        throw badRequest("each participant needs userId and role");
      }
    }

    const contextKey = contextKeyForInternalContextId(contextType, contextId);
    const now = new Date();

    try {
      const conversation = await conversationModel.create({
        contextType,
        contextId,
        contextKey,
        createdBy: createdBy || "system",
        participants: participants.map((p) => ({
          userId: p.userId,
          role: p.role,
          joinedAt: now,
          lastReadAt: null,
          leftAt: null,
        })),
      });
      return res.status(201).json(conversation);
    } catch (err) {
      // Same create-or-open semantics as the public path — see
      // conversationService.js's comment on this exact pattern.
      if (err.code === DUPLICATE_KEY_ERROR) {
        const existing = await conversationModel.findByContextKey(contextKey);
        if (existing) return res.status(200).json(existing);
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
}

async function getByContext(req, res, next) {
  try {
    const contextKey = contextKeyForInternalContextId(
      req.params.type,
      req.params.id,
    );
    const conversation = await conversationModel.findByContextKey(contextKey);
    if (!conversation) throw notFound("Conversation not found");
    res.json(conversation);
  } catch (err) {
    next(err);
  }
}

/**
 * Sends a message on behalf of a trusted internal caller — no participant or
 * LOCKED check, unlike messageService.sendMessage. A SYSTEM notification
 * ("order shipped") must still land even in a room an Admin has locked for
 * moderation; only human-to-human replies are blocked by LOCKED.
 */
async function sendMessage(req, res, next) {
  try {
    const conversation = await conversationModel.findById(req.params.id);
    if (!conversation) throw notFound("Conversation not found");

    const { senderId, senderRole, type, body, payload } = req.body;
    if (!senderId || !senderRole) {
      throw badRequest("senderId and senderRole are required");
    }

    const message = await messageModel.createAndTouch({
      conversationId: conversation.id,
      senderId,
      senderRole,
      type: type || "SYSTEM",
      body: body || "",
      payload,
    });
    broadcast.broadcastMessage(conversation, message);
    res.status(201).json(message);
  } catch (err) {
    next(err);
  }
}

/** Adds a participant (e.g. a CS agent joining a dispute room) — idempotent:
 * re-adding someone already active is a no-op, not a duplicate entry. */
async function addParticipant(req, res, next) {
  try {
    const conversation = await conversationModel.findById(req.params.id);
    if (!conversation) throw notFound("Conversation not found");

    const { userId, role } = req.body;
    if (!userId || !role) throw badRequest("userId and role are required");

    const alreadyActive = conversation.participants.some(
      (p) => p.userId === userId && !p.leftAt,
    );
    if (alreadyActive) return res.json(conversation);

    const updated = await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        participants: {
          push: {
            userId,
            role,
            joinedAt: new Date(),
            lastReadAt: null,
            leftAt: null,
          },
        },
      },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

/** Admin locking a room under moderation (CHAT-007 wires the caller side of
 * this up to an actual report/report-decision UI; this endpoint itself has
 * no opinion on why status is changing). */
async function updateStatus(req, res, next) {
  try {
    const { status } = req.body;
    if (!VALID_STATUSES.includes(status)) {
      throw badRequest(`status must be one of ${VALID_STATUSES.join(", ")}`);
    }
    const conversation = await conversationModel.findById(req.params.id);
    if (!conversation) throw notFound("Conversation not found");

    const updated = await prisma.conversation.update({
      where: { id: conversation.id },
      data: { status },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

/** Full, unpaginated message history for one conversation — evidence
 * gathering (a dispute, a report review), not for driving a chat UI, which
 * is why this deliberately skips the public cursor-pagination contract. */
async function getTranscript(req, res, next) {
  try {
    const conversation = await conversationModel.findById(req.params.id);
    if (!conversation) throw notFound("Conversation not found");

    const messages = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "asc" },
    });
    res.json({ conversation, messages });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createConversation,
  getByContext,
  sendMessage,
  addParticipant,
  updateStatus,
  getTranscript,
};
