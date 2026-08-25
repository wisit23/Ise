const { badRequest, forbidden, notFound, conflict } = require("@reloop/shared");
const ticketModel = require("./ticketModel");
const { canTransition } = require("./ticketState");
const { calculatePriority, calculateSlaDueAt } = require("../sla/priority");
const auditLog = require("../audit/auditLog");

const AGENT_ROLES = new Set(["SUPPORT", "ADMIN"]);
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
}) {
  if (!subject?.trim()) throw badRequest("subject is required");
  if (!CATEGORIES.has(category)) {
    throw badRequest(`category must be one of ${[...CATEGORIES].join(", ")}`);
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
  search,
  ...pagination
}) {
  if (!isAgent(role)) throw forbidden("only support agents can view the queue");
  return ticketModel.listQueue({
    scope,
    assigneeId: userId,
    status,
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

  return ticketModel.findById(ticketId);
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

  return ticketModel.findById(ticketId);
}

module.exports = {
  createTicket,
  getTicket,
  listMine,
  listQueue,
  reply,
  assignToSelf,
  changeStatus,
};
