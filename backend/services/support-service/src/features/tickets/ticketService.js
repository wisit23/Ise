const {
  badRequest,
  forbidden,
  notFound,
  conflict,
  AppError,
  scoreCase,
  enrichStaffRows,
} = require("@reloop/shared");

const prisma = require("../../models/prismaClient");
const ticketModel = require("./ticketModel");
const { canTransition, STATUSES } = require("./ticketState");
const auditLog = require("../audit/auditLog");
const chatClient = require("../../services/chatClient");
const { notifyTicketStatus } = require("./ticketNotifications");
const orderClient = require("../../services/orderClient");
const riskClient = require("../../services/riskClient");

const { ticketCapabilities } = require("./workspacePolicy");

const AGENT_ROLES = new Set(["CUSTOMER_SERVICE", "TRUST_AND_SAFETY", "ADMIN"]);

function isAgent(role) {
  return AGENT_ROLES.has(role);
}

/** Strips internal-only notes from a ticket unless the viewer is an agent. */
function toRequesterView(ticket) {
  return {
    ...ticket,
    messages: (ticket.messages || []).filter((m) => !m.isInternal),
  };
}

async function assertAccess({ ticketId, userId, role }) {
  const ticket = await ticketModel.findById(ticketId);
  if (!ticket) throw notFound("ticket not found");
  if (ticket.deletedAt && !["ADMIN", "TRUST_AND_SAFETY"].includes(role)) throw notFound("ticket not found");

  if (ticket.requesterId === userId) return ticket;
  // Trust & Safety / Admin is the escalation and safety authority; they can inspect
  // and moderate any ticket in the system without assignee-lockout.
  if (role === "ADMIN" || role === "TRUST_AND_SAFETY") return ticket;
  if (role === "CUSTOMER_SERVICE" && ticket.chatResponderId === userId) return ticket;
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
  if (typeof category !== "string" || !category.trim())
    throw badRequest("category is required");
  if (targetId && targetId === requesterId) {
    throw badRequest("cannot name yourself as the counterparty");
  }

  let order = null;
  if (orderId) {
    order = await orderClient.getOrder(orderId);
    if (!order) throw notFound("order not found");
    if (order.buyerId !== requesterId && order.sellerId !== requesterId) {
      throw forbidden("you do not own this order");
    }
    const counterpartyId =
      order.buyerId === requesterId ? order.sellerId : order.buyerId;
    if (targetId && targetId !== counterpartyId)
      throw badRequest("targetId does not match this order");
    targetId = counterpartyId;
  }
  let reportCount = 0;
  let riskLookupAvailable = true;
  if (targetId) {
    try {
      reportCount = await riskClient.getReportCount(targetId);
    } catch (err) {
      riskLookupAvailable = false;
      console.error(`[ticketService] risk lookup unavailable: ${err.message}`);
    }
  }
  const amount = order?.finalPrice ?? order?.price ?? 0;
  const classification = scoreCase({
    amount,
    reportCount,
    category,
    reason: `${subject} ${description || ""}`,
  });
  const { priority, priorityScore } = classification;

  const ticket = await ticketModel.create({
    requesterId,
    subject: subject.trim(),
    description: description?.trim() || "",
    category,
    orderId: orderId || null,
    targetId: targetId || null,
    priority,
    priorityScore,
    riskReportCount: reportCount,
    classification: { ...classification, riskLookupAvailable },
  });

  // Best-effort: open a chat room for this support ticket so the requester
  // can talk to the assigned agent in real-time once one picks it up.
  try {
    const conversation = await chatClient.createSupportConversation(
      ticket.id,
      ticket.referenceCode || ticket.ticketNumber,
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

function toTicketMessage(message, ticketId) {
  return {
    id: message.id,
    ticketId,
    chatMessageId: message.id,
    authorId: message.senderId,
    authorRole: ["AGENT", "ADMIN", "TRUST_AND_SAFETY"].includes(
      message.senderRole,
    )
      ? "AGENT"
      : message.senderRole === "SYSTEM"
        ? "SYSTEM"
        : "REQUESTER",
    body: message.body,
    type: message.type,
    payload: message.payload,
    isInternal: message.visibility === "INTERNAL",
    createdAt: message.createdAt,
  };
}

async function getTicket({ ticketId, userId, role, before, limit }) {
  const ticket = await assertAccess({ ticketId, userId, role });
  if (
    ticket.status === "ESCALATED" &&
    role === "CUSTOMER_SERVICE" &&
    ticket.requesterId !== userId && ticket.chatResponderId !== userId
  )
    throw forbidden(
      "only Trust and Safety staff can access an escalated ticket",
    );
  const includeInternal = isAgent(role) && ticket.requesterId !== userId;
  try {
    if (!ticket.conversationId) throw new AppError(503, "Ticket conversation is not ready");
    const page = await chatClient.getTicketMessages(ticket.conversationId, {
      includeInternal, before, limit,
    });
    ticket.messages = page.messages.map((m) => toTicketMessage(m, ticket.id));
    ticket.messagesNextCursor = page.nextCursor;
    ticket.chatAvailable = true;
  } catch (error) {
    if (![502, 503, 504].includes(error.status)) throw error;
    // Ticket operations remain available, but never imply an unavailable history is empty.
    ticket.messages = [];
    ticket.chatAvailable = false;
    ticket.chatError = "Message history is temporarily unavailable";
  }
  if (includeInternal) {
    ticket.capabilities = ticketCapabilities(ticket, userId, role);
    return (
      await enrichStaffRows([ticket], ["requesterId", "assigneeId", "targetId"])
    )[0];
  }
  return toRequesterView(ticket);
}

async function listMine(requesterId, pagination) {
  return ticketModel.listByRequester(requesterId, pagination);
}

async function listQueue({
  role,
  userId,
  scope,
  work,
  retention,
  status,
  priority,
  search,
  ...pagination
}) {
  if (!isAgent(role)) throw forbidden("only support agents can view the queue");
  retention = require("@reloop/shared/src/caseRetention").retentionView(retention, role);
  if (work && !["open", "overdue", "soon", "reply"].includes(work))
    throw badRequest("invalid work filter");
  if (scope && !["mine", "unassigned", "escalated", "closed", "all", "history"].includes(scope))
    throw badRequest("invalid scope");
  if (status && !STATUSES.includes(status)) throw badRequest("invalid status");
  if (
    priority &&
    !Object.hasOwn(require("@reloop/shared").SERVICE_POLICIES, priority)
  )
    throw badRequest("invalid priority");
  const replyIds =
    work === "reply"
      ? await require("@reloop/shared/src/awaitingReply").awaitingReplyIds(
          require("../../models/prismaClient"),
          require("../../generated/prisma-client").Prisma,
          require("./agentDashboard").ticketDashboardBase(userId),
          userId,
          "tickets",
        )
      : undefined;
  const queue = await ticketModel.listQueue({
    replyIds,
    retention,
    role,
    scope,
    work,
    assigneeId: userId,
    status,
    priority,
    search,
    ...pagination,
  });
  const ratings = await ticketModel.ratingsFor(queue.items.map((ticket) => ticket.id));
  return {
    ...queue,
    items: await enrichStaffRows(
      queue.items.map((ticket) => {
        const score = scoreCase({
          priority: ticket.priority,
          reportCount: ticket.riskReportCount,
          reason: `${ticket.subject} ${ticket.description}`,
          isDispute: ticket.category === "PAYMENT",
          slaExpiresAt: ticket.slaDueAt,
        });
        return {
          ...ticket,
          capabilities: ticketCapabilities(ticket, userId, role),
          csat: ratings.get(ticket.id) || [],
          queuePriority: ticket.priority,
          priorityScore: score.priorityScore,
        };
      }),
      ["requesterId", "assigneeId", "targetId"],
    ),
  };
}

async function reply({ ticketId, userId, role, body, isInternal, eventKey }) {
  if (typeof body !== "string" || !body.trim())
    throw badRequest("body is required");
  if (["ADMIN","TRUST_AND_SAFETY"].includes(role) && !isInternal) {
    throw forbidden("Trust and Safety audit is read-only for customer conversations");
  }
  const ticket = await assertAccess({ ticketId, userId, role });

  if (ticket.status === "CLOSED") {
    throw badRequest("cannot reply to a closed ticket");
  }

  if (role === "CUSTOMER_SERVICE" && ticket.assigneeId !== userId && ticket.chatResponderId !== userId)
    throw forbidden("claim this ticket before replying");

  // A non-agent's isInternal is ignored rather than rejected — only agents
  // can ever produce an internal-only message either way.
  const joined = await joinTicketChat({ ticketId, userId, role });
  const message = await chatClient.sendTicketMessage(joined.conversationId, {
    senderId: userId,
    body: body.trim(),
    visibility:
      Boolean(isInternal) && isAgent(role) && ticket.requesterId !== userId
        ? "INTERNAL"
        : "ALL",
    eventKey,
  });
  // Chat persists PENDING metadata delivery before acknowledging the message.
  // Its retry worker updates CS SLA/audit even if CS crashes after this call.
  return toTicketMessage(message, ticketId);
}

async function assignToSelf({ ticketId, userId, role, version }) {
  if (!isAgent(role))
    throw forbidden("only support agents can pick up tickets");
  const ticket = await ticketModel.findById(ticketId);
  if (!ticket) throw notFound("ticket not found");
  if (ticket.status === "CLOSED")
    throw badRequest("cannot claim a closed ticket");
  if (version !== undefined && version !== ticket.version)
    throw conflict("ticket was modified, reload before claiming");
  if (ticket.assigneeId) throw conflict("ticket already has an assignee");
  if (ticket.status === "ESCALATED" && role === "CUSTOMER_SERVICE")
    throw forbidden(
      "only Trust and Safety staff can claim an escalated ticket",
    );

  const ok = await ticketModel.assign({
    id: ticketId,
    version: ticket.version,
    assigneeId: userId,
    ...(role === "CUSTOMER_SERVICE" ? {chatResponderId:userId} : {}),
  });
  if (!ok) throw conflict("ticket was already taken or modified");

  // Best-effort: add the agent to the support chat room.
  const assigned = await ticketModel.findById(ticketId);
  if (assigned?.conversationId) {
    try {
      await chatClient.addAgentToConversation(assigned.conversationId, userId);
    } catch {
      assigned.chatJoinError = "Chat membership could not be refreshed";
    }
  }
  if (assigned && ticket.status === "NEW") await notifyTicketStatus(assigned, "ASSIGNED", "NEW");
  return assigned;
}

async function changeStatus({
  ticketId,
  userId,
  role,
  status,
  reason,
  version,
}) {
  if (!isAgent(role))
    throw forbidden("only support agents can change ticket status");
  const ticket = await assertAccess({ ticketId, userId, role });

  if (ticket.assigneeId !== userId || (role === "CUSTOMER_SERVICE" && ticket.status === "ESCALATED"))
    throw forbidden("only the case owner can change this ticket status");
  if (version !== undefined && version !== ticket.version)
    throw conflict("ticket was modified, reload before changing status");
  if (!canTransition(ticket.status, status)) {
    throw badRequest(`cannot transition from ${ticket.status} to ${status}`);
  }
  if (status === "ESCALATED" && !reason?.trim()) {
    throw badRequest("escalation reason is required");
  }
  if (
    status === "ESCALATED" &&
    role === "CUSTOMER_SERVICE" &&
    ticket.assigneeId !== userId
  ) {
    throw forbidden("only the assigned agent can escalate this ticket");
  }

  const ok = await ticketModel.transitionStatus({
    id: ticketId,
    version: ticket.version,
    status,
    actorId: userId,
    ...(status === "ESCALATED" && role === "CUSTOMER_SERVICE" ? {chatResponderId:userId} : {}),
    reason: reason?.trim() || null,
  });
  if (!ok) throw conflict("ticket was modified concurrently, reload and retry");

  // Best-effort chat notifications for meaningful status changes.
  const updated = await ticketModel.findById(ticketId);
  await notifyTicketStatus(updated || { ...ticket, status }, status, ticket.status);
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
      return {
        ...updated,
        chatLocked,
        ...(chatLockError ? { chatLockError } : {}),
      };
    } else if (status === "RESOLVED") {
      try {
        await chatClient.sendSystemMessage(
          updated.conversationId,
          "เจ้าหน้าที่แจ้งว่าแก้ไขปัญหาเรียบร้อยแล้ว",
          { event: "ticket.resolved", ticketId },
        );
      } catch (err) {
        console.error(
          `[ticketService] sendSystemMessage error: ${err.message}`,
        );
      }
    } else if (status === "IN_PROGRESS" && ticket.status === "RESOLVED") {
      try {
        await chatClient.sendSystemMessage(
          updated.conversationId,
          "เคสถูกเปิดใหม่อีกครั้ง",
          { event: "ticket.reopened", ticketId },
        );
      } catch (err) {
        console.error(
          `[ticketService] sendSystemMessage error: ${err.message}`,
        );
      }
    } else if (status === "ESCALATED") {
      try {
        await chatClient.sendSystemMessage(
          updated.conversationId,
          "เคสถูกส่งต่อให้Trust and Safetyแล้ว",
          { event: "ticket.escalated", ticketId },
        );
      } catch (err) {
        console.error(
          `[ticketService] sendSystemMessage error: ${err.message}`,
        );
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
    if (
      ticket.requesterId !== userId &&
      role !== "ADMIN" &&
      role !== "TRUST_AND_SAFETY" &&
      !(role === "CUSTOMER_SERVICE" && ticket.chatResponderId === userId)
    ) {
      throw forbidden(
        "only Trust and Safety staff can access an escalated ticket",
      );
    }
  } else {
    if (ticket.requesterId !== userId) {
      if (role === "ADMIN" || role === "TRUST_AND_SAFETY") {
        // Admin and T&S have system-wide oversight
      } else if (isAgent(role)) {
        // CUSTOMER_SERVICE: permitted if unassigned or if they are the current assignee
        if (ticket.assigneeId !== null && ticket.assigneeId !== userId && ticket.chatResponderId !== userId) {
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
        throw new AppError(
          502,
          "chat-service failed to create support conversation",
        );
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
    await chatClient.addParticipantToConversation(
      conversationId,
      userId,
      chatRole,
    );
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
      dedupeKey: `join:${ticket.id}:${userId}:${action}`,
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
  if (ticket.status === "ESCALATED" && role === "CUSTOMER_SERVICE" && ticket.chatResponderId !== userId) {
    throw forbidden(
      "only Trust and Safety staff can access an escalated ticket",
    );
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

/** Records a chat-service delivery event (POST /internal/chat-events). */
async function recordChatEvent(data) {
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
  const isInternal = Boolean(
    data.isInternal ??
    (data.visibility === "INTERNAL" || message.visibility === "INTERNAL"),
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

  return ticketModel.recordChatMessage({
    ticketId,
    conversationId,
    chatMessageId: chatMessageId.trim(),
    authorId: authorId.trim(),
    authorRole: authorRole.trim(),
    isInternal,
    createdAt,
  });
}

/** Who may read/write a ticket's chat room — asked by chat-service
 * (GET /internal/tickets/:id/chat-access/:userId). */
async function getChatAccess({ ticketId, userId, role }) {
  const ticket = await ticketModel.findById(ticketId);
  if (!ticket || (ticket.deletedAt && role !== "ADMIN")) return { allowed: false, writable: false };
  const isRequester = role === "BUYER" && ticket.requesterId === userId;
  const isAdmin = role === "ADMIN";
  const isCaseAgent =
    role === "AGENT" &&
    (ticket.chatResponderId === userId || (ticket.status !== "ESCALATED" &&
    (ticket.assigneeId === null || ticket.assigneeId === userId)));
  const allowed = isRequester || isAdmin || isCaseAgent;
  const writable =
    allowed &&
    !isAdmin &&
    ticket.status !== "CLOSED" &&
    (!isCaseAgent || ticket.assigneeId === userId || ticket.chatResponderId === userId);
  return { allowed, writable };
}

async function getDashboardMetrics({role,days}) {
 if(!isAgent(role))throw forbidden("only support agents can view dashboard metrics");
 const count=Number(days || 8);if(!Number.isInteger(count)||count<1||count>31)throw badRequest("days must be an integer between 1 and 31");
 return ticketModel.dashboardMetrics({includeEscalated:["ADMIN","TRUST_AND_SAFETY"].includes(role),days:count});
}
async function takeoverTicket({ticketId,userId,role,version,reason}) {
 if(!["ADMIN","TRUST_AND_SAFETY"].includes(role))throw forbidden("only trust & safety can take over an assigned ticket");
 if(!Number.isInteger(version))throw badRequest("version is required");
 const ticket=await ticketModel.findById(ticketId);if(!ticket)throw notFound("ticket not found");
 if(ticket.status!=="ESCALATED")throw badRequest("only escalated tickets can be taken over");
 if(ticket.assigneeId===userId)return getTicket({ticketId,userId,role});
 if(!await ticketModel.reassign({id:ticketId,version,assigneeId:userId,assignedById:userId,reason:reason || "Trust & Safety takeover"}))throw conflict("ticket was modified concurrently, reload and retry");
 return getTicket({ticketId,userId,role});
}
module.exports = {
 getDashboardMetrics,takeoverTicket,
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
  recordChatEvent,
  getChatAccess,
};
