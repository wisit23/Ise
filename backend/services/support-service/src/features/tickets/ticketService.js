const { badRequest, forbidden, notFound, conflict, AppError } = require("@reloop/shared");
const prisma = require("../../models/prismaClient");
const ticketModel = require("./ticketModel");
const { canTransition } = require("./ticketState");
const { calculatePriority, calculateSlaDueAt } = require("../sla/priority");
const auditLog = require("../audit/auditLog");
const chatClient = require("../../services/chatClient");

const AGENT_ROLES = new Set(["CUSTOMER_SERVICE", "ADMIN", "TRUST_AND_SAFETY"]);
const CATEGORIES = new Set([
  "ORDER",
  "PAYMENT",
  "ACCOUNT",
  "TECHNICAL",
  "OTHER",
]);

function isAgent(role) {
  return AGENT_ROLES.has(role);
}

/** Strips internal-only notes from a ticket unless the viewer is an agent. */
function toRequesterView(ticket) {
  return {
    ...ticket,
    messages: ticket.messages.filter((m) => !m.isInternal),
  };
}

async function assertAccess({ ticketId, userId, role }) {
  const ticket = await ticketModel.findById(ticketId);
  if (!ticket) throw notFound("ticket not found");

  if (ticket.requesterId === userId) return ticket;
  // Trust & Safety / Admin is the escalation and safety authority; they can inspect
  // and moderate any ticket in the system without assignee-lockout.
  if (role === "ADMIN" || role === "TRUST_AND_SAFETY") return ticket;
  if (isAgent(role) && ticket.assigneeId === userId) return ticket;
  if (isAgent(role) && ticket.assigneeId === null) return ticket; // unassigned: any agent may pick it up / view it
  throw forbidden("you do not have access to this ticket");
}

async function createTicket({
  requesterId,
  subject,
  description,
  category,
  orderId,
  targetId,
}) {
  if (!subject?.trim()) throw badRequest("subject is required");
  if (!CATEGORIES.has(category)) {
    throw badRequest(`category must be one of ${[...CATEGORIES].join(", ")}`);
  }
  if (targetId && targetId === requesterId) {
    throw badRequest("cannot name yourself as the counterparty");
  }

  const priority = calculatePriority({
    isDispute: Boolean(orderId) && category === "PAYMENT",
    category,
  });
  const slaDueAt = calculateSlaDueAt(priority);

  const ticket = await ticketModel.create({
    requesterId,
    subject: subject.trim(),
    description: description?.trim() || "",
    category,
    orderId: orderId || null,
    targetId: targetId || null,
    priority,
    slaDueAt,
  });

  await auditLog.record({
    ticketId: ticket.id,
    actorId: requesterId,
    action: "STATUS_CHANGE",
    fromValue: null,
    toValue: "NEW",
  });

  // Best-effort: open a chat room for this support ticket so the requester
  // can talk to the assigned agent in real-time once one picks it up.
  try {
    const conversation = await chatClient.createSupportConversation(
      ticket.id,
      ticket.ticketNumber,
      requesterId,
    );
    if (conversation?.id) {
      await ticketModel.setConversationId(ticket.id, conversation.id);
      ticket.conversationId = conversation.id;
    }
  } catch (err) {
    console.error(
      `[ticketService] support conversation creation deferred: ${err.message}`,
    );
  }

  return ticket;
}

async function getTicket({ ticketId, userId, role }) {
  const ticket = await assertAccess({ ticketId, userId, role });
  return isAgent(role) ? ticket : toRequesterView(ticket);
}

async function listMine(requesterId, pagination) {
  return ticketModel.listByRequester(requesterId, pagination);
}

async function listQueue({
  role,
  userId,
  scope,
  status,
  priority,
  search,
  ...pagination
}) {
  if (!isAgent(role)) throw forbidden("only support agents can view the queue");
  return ticketModel.listQueue({
    role,
    scope,
    assigneeId: userId,
    status,
    priority,
    search,
    ...pagination,
  });
}

async function reply({ ticketId, userId, role, body, isInternal }) {
  if (!body?.trim()) throw badRequest("body is required");
  const ticket = await assertAccess({ ticketId, userId, role });

  if (ticket.status === "CLOSED") {
    throw badRequest("cannot reply to a closed ticket");
  }

  // A non-agent's isInternal is ignored rather than rejected — only agents
  // can ever produce an internal-only message either way.
  const authorRole = isAgent(role) ? "AGENT" : "REQUESTER";
  const message = await ticketModel.addMessage({
    ticketId,
    authorId: userId,
    authorRole,
    body: body.trim(),
    isInternal: Boolean(isInternal) && isAgent(role),
  });

  const extra = {};
  if (!ticket.firstResponseAt && authorRole === "AGENT") {
    extra.firstResponseAt = new Date();
  }
  if (Object.keys(extra).length > 0) {
    await ticketModel.transitionStatus({
      id: ticketId,
      version: ticket.version,
      status: ticket.status,
      extra,
    });
  }

  await auditLog.record({
    ticketId,
    actorId: userId,
    action: "REPLY",
  });

  return message;
}

async function assignToSelf({ ticketId, userId, role }) {
  if (!isAgent(role))
    throw forbidden("only support agents can pick up tickets");
  const ticket = await ticketModel.findById(ticketId);
  if (!ticket) throw notFound("ticket not found");
  if (ticket.assigneeId) throw conflict("ticket already has an assignee");

  const ok = await ticketModel.assign({
    id: ticketId,
    version: ticket.version,
    assigneeId: userId,
  });
  if (!ok) throw conflict("ticket was already taken or modified");

  await auditLog.record({
    ticketId,
    actorId: userId,
    action: "ASSIGN",
    fromValue: null,
    toValue: userId,
  });

  // Best-effort: add the agent to the support chat room.
  const assigned = await ticketModel.findById(ticketId);
  if (assigned?.conversationId) {
    await chatClient.addAgentToConversation(assigned.conversationId, userId);
  }
  return assigned;
}

async function changeStatus({ ticketId, userId, role, status, reason }) {
  if (!isAgent(role))
    throw forbidden("only support agents can change ticket status");
  const ticket = await assertAccess({ ticketId, userId, role });

  if (!canTransition(ticket.status, status)) {
    throw badRequest(`cannot transition from ${ticket.status} to ${status}`);
  }

  const extra = {};
  if (status === "RESOLVED") extra.resolvedAt = new Date();
  if (status === "CLOSED") extra.closedAt = new Date();

  const ok = await ticketModel.transitionStatus({
    id: ticketId,
    version: ticket.version,
    status,
    extra,
  });
  if (!ok) throw conflict("ticket was modified concurrently, reload and retry");

  await auditLog.record({
    ticketId,
    actorId: userId,
    action: "STATUS_CHANGE",
    fromValue: ticket.status,
    toValue: status,
    reason: reason || null,
  });

  // Best-effort chat notifications for meaningful status changes.
  const updated = await ticketModel.findById(ticketId);
  if (updated?.conversationId) {
    if (status === "CLOSED") {
      let chatLocked = false;
      let chatLockError = null;
      try {
        await chatClient.lockConversation(updated.conversationId);
        chatLocked = true;
      } catch (err) {
        console.error(
          `[ticketService] failed to lock conversation ${updated.conversationId}: ${err.message}`,
        );
        chatLockError = err.message;
      }
      return { ...updated, chatLocked, ...(chatLockError ? { chatLockError } : {}) };
    } else if (status === "RESOLVED") {
      try {
        await chatClient.sendSystemMessage(
          updated.conversationId,
          "เจ้าหน้าที่แจ้งว่าแก้ไขปัญหาเรียบร้อยแล้ว",
          { event: "ticket.resolved", ticketId },
        );
      } catch (err) {
        console.error(`[ticketService] sendSystemMessage error: ${err.message}`);
      }
    } else if (status === "IN_PROGRESS" && ticket.status === "RESOLVED") {
      try {
        await chatClient.sendSystemMessage(
          updated.conversationId,
          "เคสถูกเปิดใหม่อีกครั้ง",
          { event: "ticket.reopened", ticketId },
        );
      } catch (err) {
        console.error(`[ticketService] sendSystemMessage error: ${err.message}`);
      }
    } else if (status === "ESCALATED") {
      try {
        await chatClient.sendSystemMessage(
          updated.conversationId,
          "เคสถูกส่งต่อให้ผู้ดูแลระดับสูงแล้ว",
          { event: "ticket.escalated", ticketId },
        );
      } catch (err) {
        console.error(`[ticketService] sendSystemMessage error: ${err.message}`);
      }
    }
  }
  return updated;
}

/**
 * Authorized ticket chat join / continue.
 * - CUSTOMER_SERVICE may join only tickets they are permitted to access (unassigned or assigned to themself).
 * - On ESCALATED tickets, normal CS agents are forbidden; only ADMIN and TRUST_AND_SAFETY may join/continue.
 * - Repairs missing support conversation idempotently without duplicate rooms.
 * - Preserves existing room, complete message history, and prior participants.
 * - Adds actor with correct per-room role (ADMIN for Admin/T&S, AGENT for CS, BUYER for requester).
 * - Audits join / handoff idempotently in TicketAuditLog without duplicate records on repeated calls.
 */
async function joinTicketChat({ ticketId, userId, role }) {
  const ticket = await ticketModel.findById(ticketId);
  if (!ticket) throw notFound("ticket not found");

  // Authorization check
  if (ticket.status === "ESCALATED") {
    if (role !== "ADMIN" && role !== "TRUST_AND_SAFETY") {
      throw forbidden("only admin or trust & safety can access an escalated ticket");
    }
  } else {
    if (ticket.requesterId !== userId) {
      if (role === "ADMIN" || role === "TRUST_AND_SAFETY") {
        // Admin and T&S have system-wide oversight
      } else if (isAgent(role)) {
        // CUSTOMER_SERVICE: permitted if unassigned or if they are the current assignee
        if (ticket.assigneeId !== null && ticket.assigneeId !== userId) {
          throw forbidden("you do not have access to this ticket");
        }
      } else {
        throw forbidden("you do not have access to this ticket");
      }
    }
  }

  // Idempotent repair of missing conversation
  let conversationId = ticket.conversationId;
  if (!conversationId) {
    try {
      const conversation = await chatClient.createSupportConversation(
        ticket.id,
        ticket.ticketNumber,
        ticket.requesterId,
      );
      if (conversation?.id) {
        conversationId = conversation.id;
        await ticketModel.setConversationId(ticket.id, conversationId);
        ticket.conversationId = conversationId;
      } else {
        throw new AppError(502, "chat-service failed to create support conversation");
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(503, `chat-service is unavailable: ${err.message}`);
    }
  }

  // Determine per-room role
  let chatRole = "AGENT";
  if (role === "ADMIN" || role === "TRUST_AND_SAFETY") {
    chatRole = "ADMIN";
  } else if (role === "CUSTOMER_SERVICE") {
    chatRole = "AGENT";
  } else if (userId === ticket.requesterId) {
    chatRole = "BUYER";
  }

  // Add actor to existing room without replacing room or deleting prior participants
  try {
    await chatClient.addParticipantToConversation(conversationId, userId, chatRole);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(503, `chat-service is unavailable: ${err.message}`);
  }

  // Audit join/handoff idempotently: avoid writing duplicate JOIN/HANDOFF audit events on repeated calls
  const isHandoff =
    (ticket.assigneeId && ticket.assigneeId !== userId) ||
    ticket.status === "ESCALATED";
  const action = isHandoff ? "HANDOFF" : "JOIN";

  let existingAudit = null;
  try {
    if (typeof prisma.ticketAuditLog?.findFirst === "function") {
      existingAudit = await prisma.ticketAuditLog.findFirst({
        where: {
          ticketId: ticket.id,
          actorId: userId,
          action,
        },
      });
    }
  } catch {
    existingAudit = null;
  }

  if (!existingAudit) {
    await auditLog.record({
      ticketId: ticket.id,
      actorId: userId,
      action,
      fromValue: ticket.assigneeId || null,
      toValue: userId,
      reason: isHandoff
        ? "Continued escalated ticket conversation"
        : "Joined support conversation",
    });
  }

  return {
    ticketId: ticket.id,
    conversationId,
    role: chatRole,
  };
}

async function getTicketConversation({ ticketId, userId, role }) {
  const ticket = await assertAccess({ ticketId, userId, role });
  if (ticket.status === "ESCALATED" && role === "CUSTOMER_SERVICE") {
    throw forbidden("only admin or trust & safety can access an escalated ticket");
  }

  let conversationId = ticket.conversationId;
  if (!conversationId) {
    try {
      const conversation = await chatClient.createSupportConversation(
        ticket.id,
        ticket.ticketNumber,
        ticket.requesterId,
      );
      if (conversation?.id) {
        conversationId = conversation.id;
        await ticketModel.setConversationId(ticket.id, conversationId);
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(503, `chat-service is unavailable: ${err.message}`);
    }
  }

  return { conversationId };
}

async function recordChatMessage(payload) {
  return ticketModel.recordChatMessage(payload);
}

module.exports = {
  createTicket,
  getTicket,
  listMine,
  listQueue,
  reply,
  assignToSelf,
  changeStatus,
  joinTicketChat,
  getTicketConversation,
  recordChatMessage,
};
