const {
  serializableTransaction,
  badRequest,
  conflict,
  notFound,
  AppError,
} = require("@reloop/shared");

const { randomUUID } = require("node:crypto");

const { Prisma } = require("../../generated/prisma-client");
const prisma = require("../../models/prismaClient");
const audit = require("../audit/auditLog");
const { ticketInclude, toTicket } = require("./ticketShape");
const { canTransition } = require("./ticketState");

function transaction(work, client = prisma) {
  return serializableTransaction(client, work);
}

async function setup(
  db,
  { category, priority = "NORMAL", status = "NEW", at = new Date() },
) {
  const [cat, pri, state] = await Promise.all([
    db.ticketCategory.findUnique({ where: { code: category } }),
    db.ticketPriority.findUnique({ where: { code: priority } }),
    db.ticketStatus.findUnique({ where: { code: status } }),
  ]);
  if (!cat?.isActive || !pri?.isActive || !state)
    throw badRequest("Unknown or inactive ticket classification");
  const policies = await db.slaPolicy.findMany({
    where: {
      priorityId: pri.id,
      categoryId: { in: [cat.id] },
      effectiveFrom: { lte: at },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }],
    },
    orderBy: { effectiveFrom: "desc" },
  });
  let policy = policies[0];
  if (!policy) {
    policy = await db.slaPolicy.findFirst({
      where: {
        priorityId: pri.id,
        categoryId: null,
        effectiveFrom: { lte: at },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }],
      },
      orderBy: { effectiveFrom: "desc" },
    });
  }
  if (!policy)
    throw new AppError(
      503,
      "No effective SLA policy; run the support-service seed",
    );
  return { cat, pri, state, policy };
}

async function create(data, client = prisma) {
  return transaction(async (db) => {
    const at = data.createdAt ?? new Date();
    const { cat, pri, state, policy } = await setup(db, { ...data, at });
    const ticket = await db.supportTicket.create({
      data: {
        id: data.id ?? randomUUID(),
        ...(data.ticketNumber ? { ticketNumber: data.ticketNumber } : {}),
        requesterId: data.requesterId,
        subject: data.subject,
        description: data.description ?? "",
        categoryId: cat.id,
        priorityId: pri.id,
        currentStatusId: state.id,
        orderId: data.orderId ?? null,
        targetId: data.targetId ?? null,
        priorityScore: data.priorityScore ?? 0,
        riskReportCount: data.riskReportCount ?? 0,
        createdAt: at,
      },
    });
    await db.ticketStatusHistory.create({
      data: {
        ticketId: ticket.id,
        toStatusId: state.id,
        changedById: data.requesterId,
        createdAt: at,
      },
    });
    await db.ticketSlaTarget.createMany({
      data: [
        {
          ticketId: ticket.id,
          policyId: policy.id,
          metricType: "FIRST_RESPONSE",
          dueAt:
            data.slaDueAt ??
            new Date(+at + policy.firstResponseMinutes * 60000),
          achievedAt: data.firstResponseAt ?? null,
        },
        {
          ticketId: ticket.id,
          policyId: policy.id,
          metricType: "RESOLUTION",
          dueAt:
            data.slaDueAt ?? new Date(+at + policy.resolutionMinutes * 60000),
          achievedAt: data.resolvedAt ?? data.closedAt ?? null,
        },
      ],
    });
    if (data.assigneeId) {
      await db.ticketAssignment.create({
        data: {
          ticketId: ticket.id,
          assigneeId: data.assigneeId,
          assignedById: data.assignedById ?? data.assigneeId,
          assignedAt: at,
          endedAt: data.status === "CLOSED" ? (data.closedAt ?? at) : null,
          endReason: data.status === "CLOSED" ? "Imported closed ticket" : null,
        },
      });
    }
    if (data.conversationId)
      await db.ticketChatLink.create({
        data: {
          ticketId: ticket.id,
          conversationId: data.conversationId,
        },
      });
    // Explicit timestamps are accepted for fixtures/imports, never exposed as public create input.
    for (const [code, date] of [
      ["RESOLVED", data.resolvedAt],
      ["CLOSED", data.closedAt],
      ["ESCALATED", data.escalatedAt],
    ]) {
      if (!date) continue;
      const status = await db.ticketStatus.findUnique({ where: { code } });
      await db.ticketStatusHistory.create({
        data: {
          ticketId: ticket.id,
          toStatusId: status.id,
          changedById: "fixture",
          createdAt: date,
          reason: code === "ESCALATED" ? (data.escalationNote ?? null) : null,
        },
      });
    }
    await audit.record(
      {
        ticketId: ticket.id,
        actorId: data.requesterId,
        action: "STATUS_CHANGE",
        fromValue: null,
        toValue: state.code,
        createdAt: at,
      },
      db,
    );
    if (data.classification)
      await audit.record(
        {
          ticketId: ticket.id,
          actorId: data.requesterId,
          action: "CLASSIFY",
          toValue: pri.code,
          payload: { ...data.classification, slaPolicyId: policy.id },
          createdAt: at,
        },
        db,
      );
    return toTicket(
      await db.supportTicket.findUnique({
        where: { id: ticket.id },
        include: ticketInclude,
      }),
    );
  }, client);
}

async function findById(id, db = prisma) {
  return toTicket(
    await db.supportTicket.findUnique({
      where: { id },
      include: ticketInclude,
    }),
  );
}

async function listByRequester(requesterId, { skip = 0, take = 20 } = {}) {
  const where = { requesterId };
  const [items, total] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      include: ticketInclude,
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.supportTicket.count({ where }),
  ]);
  return { items: items.map(toTicket), total };
}

function queueFilter({
  role,
  scope = "unassigned",
  assigneeId,
  status,
  priority,
  search,
  work,
  replyIds,
  now = new Date(),
}) {
  const clauses = [];
  if (work === "reply")
    clauses.push(
      Prisma.sql`t.id IN (${replyIds?.length ? Prisma.join(replyIds) : Prisma.sql`NULL`})`,
    );
  if (work) {
    clauses.push(
      Prisma.sql`s.code IN ('NEW','ASSIGNED','IN_PROGRESS','PENDING_USER')`,
    );
    const deadline = Prisma.sql`(SELECT min(due_at) FROM ticket_sla_targets WHERE ticket_id = t.id AND achieved_at IS NULL)`;
    if (work === "overdue")
      clauses.push(Prisma.sql`${deadline} <= ${now}::timestamptz`);
    if (work === "soon")
      clauses.push(
        Prisma.sql`${deadline} > ${now}::timestamptz AND ${deadline} <= ${new Date(+now + require("@reloop/shared").customerServiceClientConfig.dashboard.warningMinutes * 60000)}::timestamptz`,
      );
  }
  if (scope === "unassigned") clauses.push(Prisma.sql`a.assignment_id IS NULL`);
  else if (scope === "mine")
    clauses.push(Prisma.sql`a.assignee_id = ${assigneeId}`);
  else if (scope === "all" && role === "CUSTOMER_SERVICE")
    clauses.push(
      Prisma.sql`(a.assignment_id IS NULL OR a.assignee_id = ${assigneeId})`,
    );
  if (status) clauses.push(Prisma.sql`s.code = ${status}`);
  else if (scope !== "all")
    clauses.push(Prisma.sql`s.code NOT IN ('CLOSED', 'ESCALATED')`);
  else if (!["ADMIN", "TRUST_AND_SAFETY"].includes(role))
    clauses.push(Prisma.sql`s.code <> 'ESCALATED'`);
  if (priority) clauses.push(Prisma.sql`p.code = ${priority}`);
  if (search) {
    const pattern = "%" + search.replace(/[\\%_]/g, "\\$&") + "%";
    clauses.push(
      Prisma.sql`(t.subject ILIKE ${pattern} OR t.ticket_number ILIKE ${pattern})`,
    );
  }
  return clauses.length
    ? Prisma.sql`WHERE ${Prisma.join(clauses, " AND ")}`
    : Prisma.empty;
}

async function listQueue(options = {}) {
  if (options.role === "CUSTOMER_SERVICE" && options.status === "ESCALATED")
    return { items: [], total: 0 };
  if (!["sla", "newest", "oldest", "priority"].includes(options.sort || "sla"))
    throw require("@reloop/shared").badRequest("invalid sort");
  const ordering = {
    sla: Prisma.sql`sla.due_at ASC NULLS LAST, t.priority_score DESC, t.id ASC`,
    newest: Prisma.sql`t.created_at DESC, t.id ASC`,
    oldest: Prisma.sql`t.created_at ASC, t.id ASC`,
    priority: Prisma.sql`p.rank DESC, sla.due_at ASC NULLS LAST, t.priority_score DESC, t.id ASC`,
  }[options.sort || "sla"];
  const filter = queueFilter(options);
  const from = Prisma.sql`FROM support_tickets t
    JOIN ticket_statuses s ON s.ticket_status_id = t.current_status_id
    JOIN ticket_priorities p ON p.ticket_priority_id = t.ticket_priority_id
    LEFT JOIN LATERAL (SELECT assignment_id,assignee_id FROM ticket_assignments
      WHERE ticket_id=t.id AND (ended_at IS NULL OR s.code='CLOSED')
      ORDER BY assigned_at DESC LIMIT 1) a ON true`;
  const [ids, counts] = await Promise.all([
    prisma.$queryRaw`SELECT t.id ${from}
      LEFT JOIN LATERAL (SELECT min(due_at) AS due_at FROM ticket_sla_targets
        WHERE ticket_id = t.id AND achieved_at IS NULL AND s.code NOT IN ('CLOSED','RESOLVED')) sla ON true
      ${filter} ORDER BY ${ordering}
      LIMIT ${options.take ?? 20} OFFSET ${options.skip ?? 0}`,
    prisma.$queryRaw`SELECT count(*)::int AS total ${from} ${filter}`,
  ]);
  if (!ids.length) return { items: [], total: counts[0].total };
  const rows = await prisma.supportTicket.findMany({
    where: { id: { in: ids.map((r) => r.id) } },
    include: ticketInclude,
  });
  const byId = new Map(rows.map((r) => [r.id, toTicket(r)]));
  return {
    items: ids.map((r) => byId.get(r.id)).filter(Boolean),
    total: counts[0].total,
  };
}

async function markAchieved(db, ticketId, metricType, at) {
  await db.ticketSlaTarget.updateMany({
    where: { ticketId, metricType, achievedAt: null },
    data: { achievedAt: at },
  });
}

async function assign({ id, version, assigneeId, assignedById = assigneeId }) {
  try {
    return await transaction(async (db) => {
      const ticket = await db.supportTicket.findUnique({
        where: { id },
        include: { currentStatus: true },
      });
      if (
        !ticket ||
        ticket.currentStatus.isTerminal ||
        ticket.currentStatus.code === "RESOLVED"
      )
        return false;
      const status =
        ticket.currentStatus.code === "NEW"
          ? await db.ticketStatus.findUnique({ where: { code: "ASSIGNED" } })
          : ticket.currentStatus;
      const { count } = await db.supportTicket.updateMany({
        where: { id, version, assignments: { none: { endedAt: null } } },
        data: { currentStatusId: status.id, version: { increment: 1 } },
      });
      if (!count) return false;
      const now = new Date();
      await db.ticketAssignment.create({
        data: { ticketId: id, assigneeId, assignedById, assignedAt: now },
      });
      if (status.id !== ticket.currentStatusId)
        await db.ticketStatusHistory.create({
          data: {
            ticketId: id,
            fromStatusId: ticket.currentStatusId,
            toStatusId: status.id,
            changedById: assignedById,
            createdAt: now,
          },
        });
      await audit.record(
        {
          ticketId: id,
          actorId: assignedById,
          action: "ASSIGN",
          fromValue: null,
          toValue: assigneeId,
          createdAt: now,
        },
        db,
      );
      return true;
    });
  } catch (error) {
    if (error.code === "P2002") return false;
    throw error;
  }
}

async function transitionTx(
  db,
  {
    id,
    version,
    status,
    actorId = "system",
    reason = null,
    at = new Date(),
    systemEscalation = false,
  },
) {
  const current = await db.supportTicket.findUnique({
    where: { id },
    include: { currentStatus: true },
  });
  if (!current || current.version !== version) return false;
  if (!canTransition(current.currentStatus.code, status) && !systemEscalation)
    return false;
  const next = await db.ticketStatus.findUnique({ where: { code: status } });
  if (!next) throw badRequest("Unknown ticket status");
  const { count } = await db.supportTicket.updateMany({
    where: { id, version },
    data: { currentStatusId: next.id, version: { increment: 1 } },
  });
  if (!count) return false;
  await db.ticketStatusHistory.create({
    data: {
      ticketId: id,
      fromStatusId: current.currentStatusId,
      toStatusId: next.id,
      changedById: actorId,
      reason,
      createdAt: at,
    },
  });
  if (current.currentStatus.code === "RESOLVED" && status === "IN_PROGRESS") {
    const previous = await db.ticketSlaTarget.findFirst({
      where: { ticketId: id, metricType: "RESOLUTION" },
      orderBy: { cycle: "desc" },
      include: { policy: true },
    });
    if (previous)
      await db.ticketSlaTarget.create({
        data: {
          ticketId: id,
          policyId: previous.policyId,
          metricType: "RESOLUTION",
          cycle: previous.cycle + 1,
          dueAt: new Date(+at + previous.policy.resolutionMinutes * 60000),
        },
      });
  }
  if (["RESOLVED", "CLOSED"].includes(status))
    await markAchieved(db, id, "RESOLUTION", at);
  if (status === "CLOSED")
    await db.ticketAssignment.updateMany({
      where: { ticketId: id, endedAt: null },
      data: { endedAt: at, endReason: "Ticket closed" },
    });
  await audit.record(
    {
      ticketId: id,
      actorId,
      action: "STATUS_CHANGE",
      fromValue: current.currentStatus.code,
      toValue: status,
      reason,
      createdAt: at,
    },
    db,
  );
  return true;
}
function transitionStatus(args) {
  return transaction((db) => transitionTx(db, args));
}

async function setConversationId(ticketId, conversationId, db = prisma) {
  const work = async (tx) => {
    if (
      !(await tx.supportTicket.findUnique({
        where: { id: ticketId },
        select: { id: true },
      }))
    )
      throw notFound("ticket not found");
    const link = await tx.ticketChatLink.findUnique({ where: { ticketId } });
    if (link) {
      if (link.conversationId !== conversationId)
        throw conflict("ticket is linked to another conversation");
      return;
    }
    const owner = await tx.ticketChatLink.findUnique({
      where: { conversationId },
    });
    if (owner) throw conflict("conversation is linked to another ticket");
    await tx.ticketChatLink.create({ data: { ticketId, conversationId } });
  };
  if (typeof db.$transaction !== "function") return work(db);
  try {
    return await transaction(work, db);
  } catch (error) {
    // Re-read after rollback: concurrent repairs may have created the same link.
    if (error.code === "P2002") return transaction(work, db);
    throw error;
  }
}

async function recordChatMessage(
  {
    ticketId,
    conversationId,
    chatMessageId,
    authorId,
    authorRole,
    isInternal = false,
    createdAt,
  },
  client = prisma,
) {
  if (typeof chatMessageId !== "string" || !chatMessageId.trim())
    throw badRequest("chatMessageId is required");
  const date = createdAt == null ? new Date() : new Date(createdAt);
  if (Number.isNaN(+date)) throw badRequest("createdAt must be a valid date");
  if (!ticketId && !conversationId)
    throw badRequest("ticketId or conversationId is required");
  const work = async (db) => {
    const row = ticketId
      ? await db.supportTicket.findUnique({
          where: { id: ticketId },
          include: { chatLink: true },
        })
      : await db.supportTicket.findFirst({
          where: { chatLink: { conversationId } },
          include: { chatLink: true },
        });
    if (!row) throw notFound("ticket not found");
    if (
      conversationId &&
      row.chatLink?.conversationId &&
      row.chatLink.conversationId !== conversationId
    )
      throw badRequest("Ticket and conversation correlation mismatch");
    if (conversationId && !row.chatLink)
      await setConversationId(row.id, conversationId, db);
    const dedupeKey = "chat:" + chatMessageId;
    const existing = await db.ticketAuditLog.findUnique({
      where: { dedupeKey },
    });
    if (existing) {
      if (existing.ticketId !== row.id)
        throw badRequest("Chat message belongs to another ticket");
      return { event: existing, alreadyRecorded: true };
    }
    const role = (authorRole ?? "").toUpperCase();
    const resolvedRole =
      authorId === row.requesterId || ["BUYER", "REQUESTER"].includes(role)
        ? "REQUESTER"
        : role === "SYSTEM" || !authorId
          ? "SYSTEM"
          : ["AGENT", "ADMIN", "CUSTOMER_SERVICE", "TRUST_AND_SAFETY"].includes(
                role,
              )
            ? "AGENT"
            : null;
    if (!resolvedRole) throw badRequest("Unknown chat author role");
    const event = await audit.record(
      {
        ticketId: row.id,
        actorId: authorId || "system",
        action: "REPLY",
        dedupeKey,
        payload: {
          chatMessageId,
          conversationId: row.chatLink?.conversationId || conversationId,
          authorRole: resolvedRole,
          isInternal: Boolean(isInternal),
        },
        createdAt: date,
      },
      db,
    );
    if (resolvedRole === "AGENT" && !isInternal) {
      // Deliveries may arrive out of order; retain the earliest public staff reply.
      await db.ticketSlaTarget.updateMany({
        where: {
          ticketId: row.id,
          metricType: "FIRST_RESPONSE",
          OR: [{ achievedAt: null }, { achievedAt: { gt: date } }],
        },
        data: { achievedAt: date },
      });
    }
    return { event, alreadyRecorded: false };
  };
  try {
    return await transaction(work, client);
  } catch (error) {
    // Retry the whole operation so correlation is checked even for concurrent duplicate deliveries.
    if (error.code === "P2002") return transaction(work, client);
    throw error;
  }
}

async function escalateOverdue(ticketId, now) {
  return transaction(async (db) => {
    const ticket = await db.supportTicket.findUnique({
      where: { id: ticketId },
      include: { currentStatus: true },
    });
    if (!ticket || ["CLOSED", "RESOLVED"].includes(ticket.currentStatus.code))
      return false;
    const overdue = await db.ticketSlaTarget.findMany({
      where: {
        ticketId,
        achievedAt: null,
        breachedAt: null,
        dueAt: { lte: now },
      },
    });
    if (!overdue.length) return false;
    await db.ticketSlaTarget.updateMany({
      where: {
        id: { in: overdue.map((t) => t.id) },
        achievedAt: null,
        breachedAt: null,
      },
      data: { breachedAt: now },
    });
    if (ticket.currentStatus.code === "ESCALATED") return false;
    const changed = await transitionTx(db, {
      id: ticket.id,
      version: ticket.version,
      status: "ESCALATED",
      actorId: "system:sla",
      reason: "SLA breached",
      at: now,
      systemEscalation: true,
    });
    if (changed)
      await audit.record(
        {
          ticketId,
          actorId: "system:sla",
          action: "ESCALATE",
          reason: "SLA breached",
          payload: { metricTypes: overdue.map((t) => t.metricType) },
          createdAt: now,
        },
        db,
      );
    return changed;
  });
}
module.exports = {
  create,
  findById,
  listByRequester,
  listQueue,
  assign,
  transitionStatus,
  setConversationId,
  recordChatMessage,
  escalateOverdue,
  queueFilter,
};
