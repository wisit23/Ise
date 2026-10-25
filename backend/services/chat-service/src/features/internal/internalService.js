const { badRequest, notFound } = require("@reloop/shared");
const { createHash } = require("node:crypto");
const prisma = require("../../models/prismaClient");
const conversationModel = require("../conversations/conversationModel");
const conversationService = require("../conversations/conversationService");
const messageModel = require("../messages/messageModel");
const { contextKeyForInternalContextId } = require("./internalContext");
const broadcast = require("../../realtime/broadcast");
const { syncSupportMessage } = require("../sync/supportSyncWorker");
const {
  isValidCursor,
  buildPageQuery,
  paginate,
} = require("../messages/cursor");

// Business logic behind the internal API (/internal/*) that other services
// call with the internal token. internalController.js, awaitingReply.js and
// caseUnread.js only translate HTTP to these functions and back.

const DUPLICATE_KEY_ERROR = "P2002";
const VALID_STATUSES = ["ACTIVE", "ARCHIVED", "LOCKED"];
const CASE_CONTEXT_TYPES = ["SUPPORT", "DISPUTE_BUYER", "DISPUTE_SELLER"];

/**
 * create-or-open for ORDER/SUPPORT contexts, callable by other services.
 * Unlike the public PRODUCT path (conversationService.js), the caller here
 * IS trusted to say who the participants are — requireInternalToken already
 * gated this route, so there's no user JWT to derive identity from the way
 * the public endpoint does with req.userId.
 * Returns `created: false` when the room already existed.
 */
async function createCaseConversation({ contextType, contextId, participants, createdBy }) {
  if (!Array.isArray(participants) || participants.length === 0) {
    throw badRequest("participants must be a non-empty array");
  }
  for (const p of participants) {
    if (!p.userId || !p.role) {
      throw badRequest("each participant needs userId and role");
    }
  }

  const contextKey = contextKeyForInternalContextId(
    contextType,
    contextId,
    participants,
  );
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
    return { conversation, created: true };
  } catch (err) {
    // Same create-or-open semantics as the public path — see
    // conversationService.js's comment on this exact pattern.
    if (err.code === DUPLICATE_KEY_ERROR) {
      const existing = await conversationModel.findByContextKey(contextKey);
      if (existing) return { conversation: existing, created: false };
    }
    throw err;
  }
}

async function getByContext({ type, id, buyerId }) {
  const contextKey = contextKeyForInternalContextId(
    type,
    id,
    buyerId ? [{userId:buyerId,role:"BUYER"}] : [],
  );
  const conversation = await conversationModel.findByContextKey(contextKey);
  if (!conversation) throw notFound("Conversation not found");
  return conversation;
}

/**
 * Sends a message on behalf of a trusted internal caller — no participant or
 * LOCKED check, unlike messageService.sendMessage. A SYSTEM notification
 * ("order shipped") must still land even in a room an Admin has locked for
 * moderation; only human-to-human replies are blocked by LOCKED.
 * Returns `created: false` when an idempotent retry matched an existing message.
 */
async function sendSystemMessage(conversationId, input) {
  const conversation = await conversationModel.findById(conversationId);
  if (!conversation) throw notFound("Conversation not found");

  const {
    senderId,
    senderRole,
    eventKey,
    type,
    body,
    payload,
    visibility,
    idempotencyKey: bodyIdempotencyKey,
  } = input;
  if (!senderId || !senderRole) {
    throw badRequest("senderId and senderRole are required");
  }

  if(eventKey && (typeof eventKey!=="string" || eventKey.length>128))throw badRequest("eventKey must be a string of at most 128 characters");
  const messageId=eventKey ? createHash("sha256").update(`${conversation.id}:${eventKey}`).digest("hex").slice(0,24) : null;
  const rawKey =
    bodyIdempotencyKey ||
    (payload && typeof payload === "object" ? payload.idempotencyKey : null);
  const idempotencyKey =
    typeof rawKey === "string" && rawKey.trim() ? rawKey.trim() : null;

  const finalPayload = idempotencyKey
    ? {
        ...(payload && typeof payload === "object" ? payload : {}),
        idempotencyKey,
      }
    : payload;

  const isSupport = conversation.contextType === "SUPPORT";
  const MAX_ATTEMPTS = 4;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const message = await messageModel.createAndTouch({
        messageId,
        conversationId: conversation.id,
        senderId,
        senderRole,
        type: type || "SYSTEM",
        body: body || "",
        payload: finalPayload,
        visibility: visibility || "ALL",
        syncStatus: isSupport ? "PENDING" : null,
        ...(idempotencyKey ? { idempotencyKey } : {}),
      });

      if (isSupport) {
        syncSupportMessage(conversation, message);
      }

      broadcast.broadcastMessage(conversation, message);
      return { message, created: true };
    } catch (err) {
      if(messageId && err.code==="P2002"){const existing=await prisma.message.findUnique({where:{id:messageId}});if(existing?.conversationId===conversation.id)return { message: existing, created: false };}
      if (
        idempotencyKey &&
        (err.code === DUPLICATE_KEY_ERROR || err.code === "P2034")
      ) {
        const existing = await messageModel.findByIdempotencyKey(
          conversation.id,
          idempotencyKey,
        );
        if (existing) {
          return { message: existing, created: false };
        }
      }
      if (err.code === "P2034" && attempt < MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, 15 * attempt));
        continue;
      }
      throw err;
    }
  }
}

/** Adds a participant (e.g. a CS agent joining a dispute room) — idempotent:
 * re-adding someone already active is a no-op, not a duplicate entry. */
async function addParticipant(conversationId, input) {
  const conversation = await conversationModel.findById(conversationId);
  if (!conversation) throw notFound("Conversation not found");

  const { userId, role } = input;
  if (!userId || !role) throw badRequest("userId and role are required");

  // Same "active participant" rule as every other membership check.
  if (conversationService.isParticipant(conversation, userId)) return conversation;

  return prisma.conversation.update({
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
}

/** Admin locking a room under moderation (CHAT-007 wires the caller side of
 * this up to an actual report/report-decision UI; this endpoint itself has
 * no opinion on why status is changing). */
async function updateStatus(conversationId, status) {
  if (!VALID_STATUSES.includes(status)) {
    throw badRequest(`status must be one of ${VALID_STATUSES.join(", ")}`);
  }
  const conversation = await conversationModel.findById(conversationId);
  if (!conversation) throw notFound("Conversation not found");

  const updated = await prisma.conversation.update({
    where: { id: conversation.id },
    data: { status },
  });
  broadcast.broadcastStatusChange(updated, status);
  return updated;
}

/** Bounded history for evidence gathering. `before` walks toward older IDs.
 * `limit` is the raw query value (undefined means the default of 50). */
async function getTranscript(conversationId, { before, limit: rawLimit, includeInternal }) {
  const conversation = await conversationModel.findById(conversationId);
  if (!conversation) throw notFound("Conversation not found");

  if (before && !isValidCursor(before))
    throw badRequest("invalid transcript cursor");
  const requestedLimit =
    rawLimit === undefined ? 50 : Number(rawLimit);
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1) {
    throw badRequest("limit must be a positive integer");
  }
  const limit = Math.min(100, requestedLimit);
  const beforeMessage = before ? await prisma.message.findUnique({ where: { id: before } }) : undefined;
  if (before && (!beforeMessage || beforeMessage.conversationId !== conversation.id ||
    (!includeInternal && beforeMessage.visibility === "INTERNAL"))) throw badRequest("invalid transcript cursor");
  const query = buildPageQuery({
    conversationId: conversation.id,
    before,
    beforeMessage,
    limit,
    includeInternal,
  });
  const page = paginate(await prisma.message.findMany(query), limit);
  return {
    conversation,
    items: [...page.items],
    messages: [...page.items].reverse(),
    nextCursor: page.nextCursor,
  };
}

/** Removes every room for a case (and its buyer/seller variants) with its messages. */
async function deleteByContext(type, id) {
  const matching = await prisma.conversation.findMany({
    where: {
      contextId: id,
      contextType: { in: [type, `${type}_BUYER`, `${type}_SELLER`] },
    },
    include: { participants: true },
  });

  for (const conv of matching) {
    await prisma.message.deleteMany({ where: { conversationId: conv.id } });
    await prisma.conversation.delete({ where: { id: conv.id } });
    broadcast.broadcastConversationDeleted(
      conv.id,
      (conv.participants || []).map((p) => p.userId)
    );
  }

  return { deletedCount: matching.length };
}

function broadcastRealtime({ event, data, rooms, broadcastGlobal }) {
  if (!event) throw badRequest("event is required");
  broadcast.broadcastRealtime({
    event,
    data,
    rooms: Array.isArray(rooms) ? rooms : [],
    broadcastGlobal: Boolean(broadcastGlobal),
  });
}

/** Which case rooms are waiting on staff: the latest public human message came
 * from the customer side. `db` is injectable for tests. */
async function awaitingReplyIds(input, db = prisma) {
  const { ids, contextTypes } = input;
  if (
    !Array.isArray(ids) ||
    ids.length > 200 ||
    ids.some((id) => typeof id !== "string" || !id || id.length > 128) ||
    !Array.isArray(contextTypes) ||
    !contextTypes.length ||
    contextTypes.some(
      (type) =>
        !CASE_CONTEXT_TYPES.includes(type),
    )
  )
    throw badRequest("Invalid reply summary request");
  const rows = await db.conversation.aggregateRaw({
    pipeline: [
      {
        $match: {
          contextId: { $in: ids },
          contextType: { $in: contextTypes },
          status: "ACTIVE",
        },
      },
      {
        $lookup: {
          from: "Message",
          let: { room: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$conversationId", "$$room"] },
                visibility: "ALL",
                deletedAt: null,
                senderRole: {
                  $in: ["BUYER", "SELLER", "REQUESTER", "AGENT", "ADMIN"],
                },
                type: { $ne: "SYSTEM" },
              },
            },
            { $sort: { createdAt: -1, _id: -1 } },
            { $limit: 1 },
          ],
          as: "lastPublic",
        },
      },
      {
        $match: {
          "lastPublic.0.senderRole": {
            $in: ["BUYER", "SELLER", "REQUESTER"],
          },
        },
      },
      { $project: { _id: 0, contextId: 1 } },
    ],
  });
  return [...new Set(rows.map((row) => row.contextId))];
}

/** Unread customer messages per case for one staff member. `db` is injectable for tests. */
async function caseUnreadCounts(input, db = prisma) {
  const { ids, contextTypes, userId } = input || {};
  if (
    !Array.isArray(ids) ||
    ids.length > 200 ||
    ids.some((id) => typeof id !== "string" || !id || id.length > 128) ||
    typeof userId !== "string" ||
    !userId ||
    userId.length > 128 ||
    !Array.isArray(contextTypes) ||
    !contextTypes.length ||
    contextTypes.some(
      (type) =>
        !CASE_CONTEXT_TYPES.includes(type),
    )
  )
    throw badRequest("Invalid unread summary request");
  // The calling case-owner service supplies only cases this staff member
  // may inspect. Never add participants merely to compute queue badges.
  return db.conversation.aggregateRaw({
    pipeline: [
      {
        $match: {
          contextId: { $in: ids },
          contextType: { $in: contextTypes },
        },
      },
      {
        $set: {
          reader: {
            $arrayElemAt: [
              {
                $filter: {
                  input: "$participants",
                  as: "p",
                  cond: { $eq: ["$$p.userId", userId] },
                },
              },
              0,
            ],
          },
        },
      },
      {
        $lookup: {
          from: "Message",
          let: {
            room: "$_id",
            since: { $ifNull: ["$reader.lastReadAt", "$createdAt"] },
          },
          pipeline: [
            {
              $match: {
                visibility: "ALL",
                deletedAt: null,
                type: { $ne: "SYSTEM" },
                senderRole: { $in: ["BUYER", "SELLER", "REQUESTER"] },
                senderId: { $ne: userId },
                $expr: {
                  $and: [
                    { $eq: ["$conversationId", "$$room"] },
                    { $gt: ["$createdAt", "$$since"] },
                  ],
                },
              },
            },
            { $count: "total" },
          ],
          as: "unread",
        },
      },
      {
        $group: {
          _id: "$contextId",
          count: {
            $sum: { $ifNull: [{ $arrayElemAt: ["$unread.total", 0] }, 0] },
          },
        },
      },
      { $project: { _id: 0, id: "$_id", count: 1 } },
    ],
  });
}

module.exports = {
  createCaseConversation,
  getByContext,
  sendSystemMessage,
  addParticipant,
  updateStatus,
  getTranscript,
  deleteByContext,
  broadcastRealtime,
  awaitingReplyIds,
  caseUnreadCounts,
};
