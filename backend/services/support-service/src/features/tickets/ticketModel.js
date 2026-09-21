const { badRequest, notFound } = require("@reloop/shared");
const prisma = require("../../models/prismaClient");

function generateTicketNumber() {
  const n = Math.floor(Math.random() * 900000) + 100000;
  return `#CS-${n}`;
}

async function create(data) {
  // Retry on the rare ticketNumber collision instead of trusting a single
  // random draw — @unique on ticketNumber makes Prisma throw P2002 for it.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.supportTicket.create({
        data: { ...data, ticketNumber: generateTicketNumber() },
      });
    } catch (err) {
      if (err.code === "P2002" && attempt < 4) continue;
      throw err;
    }
  }
}

function findById(id) {
  return prisma.supportTicket.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
}

async function listByRequester(requesterId, { skip, take } = {}) {
  const where = { requesterId };
  const [items, total] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.supportTicket.count({ where }),
  ]);
  return { items, total };
}

/** Agent queue. scope: "unassigned" (default) | "mine" | "all" — "mine" needs
 * assigneeId, "all" ignores assignment entirely (dashboard overview). */
async function listQueue({
  role,
  scope = "unassigned",
  assigneeId,
  status,
  priority,
  search,
  skip,
  take,
} = {}) {
  const where = {};
  if (scope === "unassigned") where.assigneeId = null;
  else if (scope === "mine") where.assigneeId = assigneeId;

  if (status) {
    where.status = status;
    // Note: If role === "CUSTOMER_SERVICE" and they request ESCALATED, block it
    if (role === "CUSTOMER_SERVICE" && status === "ESCALATED") {
      return { items: [], total: 0 };
    }
  } else {
    // Default queue view: exclude ESCALATED (since they go to Admin Inbox)
    if (scope !== "all") {
      where.status = { notIn: ["CLOSED", "ESCALATED"] };
    } else {
      where.status = { notIn: ["ESCALATED"] };
    }
  }

  if (priority) where.priority = priority;

  if (search) {
    where.OR = [
      { subject: { contains: search, mode: "insensitive" } },
      { ticketNumber: { contains: search, mode: "insensitive" } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      orderBy: [{ priority: "desc" }, { slaDueAt: "asc" }],
      skip,
      take,
    }),
    prisma.supportTicket.count({ where }),
  ]);
  return { items, total };
}

function addMessage(data) {
  return prisma.ticketMessage.create({ data });
}

/** Optimistic-lock assign: only succeeds if the ticket is still unassigned at `version`. */
async function assign({ id, version, assigneeId }) {
  const { count } = await prisma.supportTicket.updateMany({
    where: { id, version, assigneeId: null },
    data: { assigneeId, status: "ASSIGNED", version: { increment: 1 } },
  });
  return count > 0;
}

/** Optimistic-lock status transition. */
async function transitionStatus({ id, version, status, extra = {} }) {
  const { count } = await prisma.supportTicket.updateMany({
    where: { id, version },
    data: { status, version: { increment: 1 }, ...extra },
  });
  return count > 0;
}

/** Stores the chat-service conversation ID on a ticket. Called once during
 * ticket creation — not an optimistic-lock update because only the creating
 * request ever writes this field, so there is no race. */
function setConversationId(ticketId, conversationId) {
  return prisma.supportTicket.update({
    where: { id: ticketId },
    data: { conversationId },
  });
}

/**
 * Idempotently records a mirrored chat message on the linked ticket.
 * Keyed by chatMessageId (@unique on TicketMessage).
 * Validates ticket/conversation correlation.
 * Updates firstResponseAt only for agent/admin replies.
 * Audits mirrored replies exactly once in the same transaction.
 */
async function recordChatMessage({
  ticketId,
  conversationId,
  chatMessageId,
  authorId,
  authorRole,
  body,
  isInternal = false,
  createdAt,
}) {
  if (!chatMessageId || typeof chatMessageId !== "string" || !chatMessageId.trim()) {
    throw badRequest("chatMessageId is required");
  }

  let messageDate = new Date();
  if (createdAt !== undefined && createdAt !== null) {
    messageDate = new Date(createdAt);
    if (isNaN(messageDate.getTime())) {
      throw badRequest("createdAt must be a valid date");
    }
  }

  // Idempotency fast path
  const existing = await prisma.ticketMessage.findUnique({
    where: { chatMessageId },
  });
  if (existing) {
    return { message: existing, alreadyRecorded: true };
  }

  // Validate ticket / conversation correlation
  let ticket = null;
  if (ticketId) {
    ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw notFound("ticket not found");
    if (conversationId && ticket.conversationId && ticket.conversationId !== conversationId) {
      throw badRequest("Ticket and conversation correlation mismatch");
    }
    if (conversationId && !ticket.conversationId) {
      await prisma.supportTicket.update({
        where: { id: ticket.id },
        data: { conversationId },
      });
      ticket.conversationId = conversationId;
    }
  } else if (conversationId) {
    ticket = await prisma.supportTicket.findFirst({
      where: { conversationId },
    });
    if (!ticket) throw notFound("ticket not found for conversation");
  } else {
    throw badRequest("ticketId or conversationId is required");
  }

  const normalizedRole = (authorRole || "").toUpperCase();
  let resolvedRole = "AGENT";
  if (
    authorId === ticket.requesterId ||
    normalizedRole === "BUYER" ||
    normalizedRole === "REQUESTER"
  ) {
    resolvedRole = "REQUESTER";
  } else if (normalizedRole === "SYSTEM") {
    resolvedRole = "SYSTEM";
  } else {
    resolvedRole = "AGENT";
  }

  const isCustomerFacingAgentReply =
    resolvedRole === "AGENT" &&
    !isInternal &&
    ["AGENT", "ADMIN", "CUSTOMER_SERVICE", "TRUST_AND_SAFETY"].includes(normalizedRole);

  const messageBody =
    body && typeof body === "string" && body.trim() ? body.trim() : "[Attachment]";

  try {
    return await prisma.$transaction(async (tx) => {
      // Re-check inside transaction
      const dup = await tx.ticketMessage.findUnique({
        where: { chatMessageId },
      });
      if (dup) {
        return { message: dup, alreadyRecorded: true };
      }

      const message = await tx.ticketMessage.create({
        data: {
          ticketId: ticket.id,
          authorId: authorId || "system",
          authorRole: resolvedRole,
          body: messageBody,
          isInternal: Boolean(isInternal),
          chatMessageId,
          createdAt: messageDate,
        },
      });

      // Atomically update firstResponseAt only for customer-facing agent/admin replies
      // where firstResponseAt is still null in the database, avoiding stale outer ticket race
      if (isCustomerFacingAgentReply) {
        await (typeof tx.supportTicket.updateMany === "function" ? tx.supportTicket.updateMany.bind(tx.supportTicket) : tx.supportTicket.update.bind(tx.supportTicket))({
          where: {
            id: ticket.id,
            firstResponseAt: null,
          },
          data: {
            firstResponseAt: messageDate,
          },
        });
      }

      // Audit mirrored replies exactly once
      await tx.ticketAuditLog.create({
        data: {
          ticketId: ticket.id,
          actorId: authorId || "system",
          action: "REPLY",
          fromValue: null,
          toValue: null,
          reason: null,
          createdAt: messageDate,
        },
      });

      return { message, alreadyRecorded: false };
    });
  } catch (err) {
    if (err.code === "P2002") {
      const raceMsg = await prisma.ticketMessage.findUnique({
        where: { chatMessageId },
      });
      if (raceMsg) {
        return { message: raceMsg, alreadyRecorded: true };
      }
    }
    throw err;
  }
}

module.exports = {
  create,
  findById,
  listByRequester,
  listQueue,
  addMessage,
  assign,
  transitionStatus,
  setConversationId,
  recordChatMessage,
};
