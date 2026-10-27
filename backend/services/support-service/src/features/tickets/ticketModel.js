const dashboardHourlyTrend = require("./dashboardHourlyTrend");
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
const events = require("./ticketEvents");

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
  // Initial rows have no shared read-check-write state: unique keys and the sequence
  // arbitrate concurrent creates. READ COMMITTED keeps the snapshot atomic without
  // false SSI conflicts between unrelated new ticket/audit index entries.
  return client.$transaction(
    async (db) => {
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
          closedAt: data.status === "CLOSED" ? (data.closedAt ?? at) : null,
          orderId: data.orderId ?? null,
          targetId: data.targetId ?? null,
          createdAt: at,
          priorityScore: data.priorityScore ?? 0,
          riskReportCount: data.riskReportCount ?? 0,
          chatResponderId: data.chatResponderId ?? null,
          classificationReasonCodes: data.classification?.reasonCodes,
          classificationPolicyVersion:
            data.classification?.policyVersion ?? null,
          riskLookupAvailable: data.classification?.riskLookupAvailable ?? null,
        },
      });
      const opened = await db.ticketStatusHistory.create({
        data: {
          ticketId: ticket.id,
          toStatusId: state.id,
          changedById: data.requesterId,
          createdAt: at,
        },
      });
      const roundId = randomUUID();
      const targets = [
        {
          id: randomUUID(),
          roundId,
          ticketId: ticket.id,
          policyId: policy.id,
          metricType: "FIRST_RESPONSE",
          dueAt:
            data.slaDueAt ??
            new Date(+at + policy.firstResponseMinutes * 60000),
          achievedAt: data.firstResponseAt ?? null,
        },
        {
          id: randomUUID(),
          roundId,
          ticketId: ticket.id,
          policyId: policy.id,
          metricType: "RESOLUTION",
          dueAt:
            data.slaDueAt ?? new Date(+at + policy.resolutionMinutes * 60000),
          achievedAt: data.resolvedAt ?? data.closedAt ?? null,
        },
      ];
      await db.ticketSlaTarget.createMany({ data: targets });
      const auditLog = [];
      const round = await events.recordRound(db, {
        ticketId: ticket.id,
        actorId: data.requesterId,
        at,
        cycle: 1,
        targets,
        policy,
        sourceHistoryId: opened.id,
      });
      targets.forEach((target) => {
        target.round = round;
      });
      auditLog.push(
        await audit.record(
          {
            ticketId: ticket.id,
            actorId: data.requesterId,
            action: "QUEUE_CLASSIFIED",
            createdAt: at,
            payload: {
              schemaVersion: 1,
              ticketVersion: 0,
              priorityScore: data.priorityScore ?? 0,
              riskReportCount: data.riskReportCount ?? 0,
              classification: data.classification ?? null,
              slaPolicyId: policy.id,
              source: data.classification ? "scoreCase" : "import",
            },
          },
          db,
        ),
      );
      if (data.chatResponderId !== undefined)
        auditLog.push(
          await events.recordResponder(db, {
            ticketId: ticket.id,
            actorId: data.requesterId,
            responderId: data.chatResponderId,
            at,
            ticketVersion: 0,
          }),
        );
      const assignments = [];
      if (data.assigneeId) {
        assignments.push(
          await db.ticketAssignment.create({
            data: {
              ticketId: ticket.id,
              assigneeId: data.assigneeId,
              assignedById: data.assignedById ?? data.assigneeId,
              assignedAt: at,
              endedAt: data.status === "CLOSED" ? (data.closedAt ?? at) : null,
              endReason:
                data.status === "CLOSED" ? "Imported closed ticket" : null,
            },
          }),
        );
      }
      if (data.conversationId)
        await db.ticketChatLink.create({
          data: {
            ticketId: ticket.id,
            conversationId: data.conversationId,
          },
        });
      const statusHistory = [{ ...opened, toStatus: state }];
      // Explicit timestamps are accepted for fixtures/imports, never exposed as public create input.
      for (const [code, date] of [
        ["RESOLVED", data.resolvedAt],
        ["CLOSED", data.closedAt],
        ["ESCALATED", data.escalatedAt],
      ]) {
        if (!date) continue;
        const status = await db.ticketStatus.findUnique({ where: { code } });
        const history = await db.ticketStatusHistory.create({
          data: {
            ticketId: ticket.id,
            toStatusId: status.id,
            changedById: "fixture",
            createdAt: date,
            reason: code === "ESCALATED" ? (data.escalationNote ?? null) : null,
          },
        });
        statusHistory.push({ ...history, toStatus: status });
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
      // Project rows already created by this transaction. Re-reading empty child relations
      // causes relation-wide SSI predicate locks on small databases and conflicts between
      // independent ticket creates; no read-back is needed for these known persisted values.
      return toTicket({
        ...ticket,
        category: cat,
        priority: pri,
        currentStatus: state,
        assignments,
        statusHistory: statusHistory.sort(
          (a, b) => +b.createdAt - +a.createdAt,
        ),
        slaTargets: targets,
        auditLog,
        chatLink: data.conversationId
          ? { conversationId: data.conversationId }
          : null,
      });
    },
    { isolationLevel: "ReadCommitted" },
  );
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
  const where = { requesterId, deletedAt: null };
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
  retention = "active",
  now = new Date(),
}) {
  const safetyQueue = ["ADMIN", "TRUST_AND_SAFETY"].includes(role);
  const clauses = retention === "all" ? [] : retention === "deleted"
    ? [Prisma.sql`t.deleted_at IS NOT NULL`]
    : [Prisma.sql`t.deleted_at IS NULL`, retention === "archived" ? Prisma.sql`t.archived_at IS NOT NULL` : Prisma.sql`t.archived_at IS NULL`];
  if (work === "reply")
    clauses.push(
      Prisma.sql`t.ticket_id IN (${replyIds?.length ? Prisma.join(replyIds) : Prisma.sql`NULL`})`,
    );
  if (work) {
    clauses.push(
      Prisma.sql`s.code IN ('NEW','ASSIGNED','IN_PROGRESS','PENDING_USER')`,
    );
    const deadline = Prisma.sql`(SELECT min(st.due_at) FROM ticket_sla_targets st WHERE st.ticket_id = t.ticket_id AND st.achieved_at IS NULL AND ${events.activeTarget})`;
    if (work === "overdue")
      clauses.push(Prisma.sql`${deadline} <= ${now}::timestamptz`);
    if (work === "soon")
      clauses.push(
        Prisma.sql`${deadline} > ${now}::timestamptz AND ${deadline} <= ${new Date(+now + require("@reloop/shared").customerServiceClientConfig.dashboard.warningMinutes * 60000)}::timestamptz`,
      );
  }
  if (scope === "unassigned")
    // CS keeps answering chat until Safety accepts the handoff by taking over.
    clauses.push(safetyQueue
      ? Prisma.sql`(a.assignment_id IS NULL OR (s.code = 'ESCALATED' AND a.assignee_id = t.chat_responder_id))`
      : Prisma.sql`a.assignment_id IS NULL`);
  else if (scope === "mine" || scope === "history")
    clauses.push(
      Prisma.sql`(a.assignee_id = ${assigneeId} OR t.chat_responder_id = ${assigneeId})`,
    );
  else if (scope === "escalated")
    // Escalated cases; CS sees only those it handed off and still chats on.
    clauses.push(
      role === "CUSTOMER_SERVICE"
        ? Prisma.sql`s.code = 'ESCALATED' AND t.chat_responder_id = ${assigneeId}`
        : Prisma.sql`s.code = 'ESCALATED'`,
    );
  else if (scope === "closed")
    // Finished work this agent handled at any point (assignment or chat).
    clauses.push(
      Prisma.sql`s.code IN ('RESOLVED','CLOSED')`,
      ...(role === "CUSTOMER_SERVICE"
        ? [Prisma.sql`(t.chat_responder_id = ${assigneeId} OR EXISTS (SELECT 1 FROM ticket_assignments ha WHERE ha.ticket_id = t.ticket_id AND ha.assignee_id = ${assigneeId}))`]
        : []),
    );
  else if (scope === "all" && role === "CUSTOMER_SERVICE")
    clauses.push(
      Prisma.sql`(a.assignment_id IS NULL OR a.assignee_id = ${assigneeId} OR t.chat_responder_id = ${assigneeId})`,
    );
  if (scope === "history") clauses.push(Prisma.sql`s.code IN ('RESOLVED', 'CLOSED')`);
  else if (status) clauses.push(Prisma.sql`s.code = ${status}`);
  else if (scope === "mine")
    clauses.push(safetyQueue
      ? Prisma.sql`s.code NOT IN ('CLOSED', 'RESOLVED')`
      : Prisma.sql`s.code NOT IN ('CLOSED', 'ESCALATED')`);
  else if (scope === "escalated" || scope === "closed") {
    // already constrained above
  } else if (scope === "unassigned" && safetyQueue)
    clauses.push(Prisma.sql`s.code <> 'CLOSED'`);
  else if (scope !== "all")
    clauses.push(
      Prisma.sql`(s.code NOT IN ('CLOSED', 'ESCALATED') OR (s.code='ESCALATED' AND t.chat_responder_id=${assigneeId}))`,
    );
  else if (!["ADMIN", "TRUST_AND_SAFETY"].includes(role))
    clauses.push(
      Prisma.sql`(s.code <> 'ESCALATED' OR t.chat_responder_id=${assigneeId})`,
    );
  if (priority) clauses.push(Prisma.sql`p.code = ${priority}`);
  if (search) {
    const pattern = "%" + search.replace(/[\\%_]/g, "\\$&") + "%";
    const reference = require("@reloop/shared").normalizeReferenceCode(search, "TKT");
    const referenceMatch = reference ? Prisma.sql`OR t.reference_code = ${reference}` : Prisma.empty;
    clauses.push(
      Prisma.sql`(t.subject ILIKE ${pattern} OR t.ticket_number ILIKE ${pattern} ${referenceMatch})`,
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
    sla: Prisma.sql`sla.due_at ASC NULLS LAST, t.priority_score DESC, t.ticket_id ASC`,
    newest: Prisma.sql`t.created_at DESC, t.ticket_id ASC`,
    oldest: Prisma.sql`t.created_at ASC, t.ticket_id ASC`,
    priority: Prisma.sql`p.rank DESC, sla.due_at ASC NULLS LAST, t.priority_score DESC, t.ticket_id ASC`,
  }[options.sort || "sla"];
  const filter = queueFilter(options);
  const from = Prisma.sql`FROM support_tickets t
    JOIN ticket_statuses s ON s.ticket_status_id = t.current_status_id
    JOIN ticket_priorities p ON p.ticket_priority_id = t.ticket_priority_id
    LEFT JOIN LATERAL (SELECT assignment_id,assignee_id FROM ticket_assignments
      WHERE ticket_id=t.ticket_id AND (ended_at IS NULL OR s.code='CLOSED')
      ORDER BY assigned_at DESC LIMIT 1) a ON true
    `;
  const [ids, counts] = await Promise.all([
    prisma.$queryRaw`SELECT t.ticket_id AS id ${from}
      LEFT JOIN LATERAL (SELECT min(st.due_at) AS due_at FROM ticket_sla_targets st
        WHERE st.ticket_id = t.ticket_id AND st.achieved_at IS NULL AND ${events.activeTarget} AND s.code NOT IN ('CLOSED','RESOLVED')) sla ON true
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

/** CSAT responses for queue rows, keyed by ticket id. */
async function ratingsFor(ids) {
  if (!ids.length) return new Map();
  const rows = await prisma.customerSatisfaction.findMany({
    where: { caseId: { in: ids } },
    select: { caseId: true, respondentSide: true, rating: true, comment: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const byCase = new Map();
  for (const row of rows) byCase.set(row.caseId, [...(byCase.get(row.caseId) || []), row]);
  return byCase;
}

async function markAchieved(db, ticketId, metricType, at) {
  const row = await db.supportTicket.findUnique({
    where: { id: ticketId },
    include: ticketInclude,
  });
  const target = events
    .effectiveTargets(row.slaTargets, row.auditLog)
    .find((t) => t.metricType === metricType);
  if (!target) return;
  await db.ticketSlaTarget.updateMany({
    where: { id: target.id, achievedAt: null },
    data: { achievedAt: at },
  });
}

// `assignedAt` is for fixtures/imports so a back-dated history stays ordered; callers omit it.
async function assign(
  { id, version, assigneeId, assignedById = assigneeId, chatResponderId, assignedAt },
  client = prisma,
) {
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
      const now = assignedAt ?? new Date();
      if (chatResponderId !== undefined)
        await events.recordResponder(db, { ticketId: id, actorId: assignedById,
          responderId: chatResponderId, at: now, ticketVersion: version + 1 });
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
    }, client);
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
    chatResponderId,
  },
) {
  const current = await db.supportTicket.findUnique({
    where: { id },
    include: ticketInclude,
  });
  if (!current || current.version !== version) return false;
  if (!canTransition(current.currentStatus.code, status) && !systemEscalation)
    return false;
  const next = await db.ticketStatus.findUnique({ where: { code: status } });
  if (!next) throw badRequest("Unknown ticket status");
  const { count } = await db.supportTicket.updateMany({
    where: { id, version },
    data: { currentStatusId: next.id, version: { increment: 1 },
      ...(status === "CLOSED" ? { closedAt: at } : { closedAt: null, archivedAt: null, deletedAt: null, retentionUntil: null }),
      // Answering a return closes it; the checklist stays for T&S to review.
      ...(status === "ESCALATED" ? { returnedAt: null } : {}),
    },
  });
  if (!count) return false;
  if (chatResponderId !== undefined)
    await events.recordResponder(db, {
      ticketId: id,
      actorId,
      responderId: chatResponderId,
      at,
      ticketVersion: version + 1,
    });
  const history = await db.ticketStatusHistory.create({
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
    const previous = events
      .effectiveTargets(current.slaTargets, current.auditLog)
      .find((t) => t.metricType === "RESOLUTION");
    if (!previous)
      throw new AppError(
        503,
        "Ticket SLA round is missing; repair history before reopening",
      );
    const policy = events.policyFromRound(previous.round);
    if (!Number.isInteger(policy.resolutionMinutes))
      throw new AppError(503, "Historical SLA duration is unknown");
    const target = await db.ticketSlaTarget.create({
      data: {
        roundId: randomUUID(),
        ticketId: id,
        policyId: previous.policyId,
        metricType: "RESOLUTION",
        dueAt: new Date(+at + policy.resolutionMinutes * 60000),
      },
    });
    await events.recordRound(db, {
      ticketId: id,
      actorId,
      at,
      cycle: events.rounds(current.slaTargets)[0].cycle + 1,
      targets: [target],
      policy,
      sourceHistoryId: history.id,
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
function transitionStatus(args, client = prisma) {
  return transaction((db) => transitionTx(db, args), client);
}

/** T&S sends an escalated ticket back to the CS agent who escalated it. */
function returnToCs(
  { id, version, actorId, csAgentId = null, reason, tasks, at = new Date() },
  client = prisma,
) {
  return transaction(async (db) => {
    const current = await db.supportTicket.findUnique({
      where: { id },
      include: { currentStatus: true },
    });
    if (
      !current ||
      current.version !== version ||
      current.currentStatus.code !== "ESCALATED"
    )
      return false;
    const next = await db.ticketStatus.findUnique({
      where: { code: "IN_PROGRESS" },
    });
    const { count } = await db.supportTicket.updateMany({
      where: { id, version },
      data: {
        currentStatusId: next.id,
        version: { increment: 1 },
        returnReason: reason,
        returnTasks: tasks,
        returnedBy: actorId,
        returnedAt: at,
      },
    });
    if (!count) return false;
    await db.ticketAssignment.updateMany({
      where: { ticketId: id, endedAt: null },
      data: { endedAt: at, endReason: "RETURNED_TO_CS" },
    });
    if (csAgentId)
      await db.ticketAssignment.create({
        data: {
          ticketId: id,
          assigneeId: csAgentId,
          assignedById: actorId,
          assignedAt: at,
        },
      });
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
    await audit.record(
      {
        ticketId: id,
        actorId,
        action: "RETURN_TO_CS",
        fromValue: actorId,
        toValue: csAgentId,
        reason,
        createdAt: at,
      },
      db,
    );
    return true;
  }, client);
}

/** The CS owner ticks or annotates one returned task. */
function updateReturnTask({ id, taskId, actorId, done, note }, client = prisma) {
  return transaction(async (db) => {
    // Lock the row: two quick ticks must not overwrite each other's list.
    await db.$queryRaw`SELECT 1 FROM support_tickets WHERE ticket_id = ${id} FOR UPDATE`;
    const before = await db.supportTicket.findUnique({ where: { id } });
    if (!before?.returnedAt) return null;
    const tasks = Array.isArray(before.returnTasks) ? before.returnTasks : [];
    const index = tasks.findIndex((task) => task.id === taskId);
    if (index < 0) return null;
    const current = tasks[index];
    const nextDone = done ?? current.done;
    const returnTasks = tasks.map((task, i) =>
      i === index
        ? {
            ...current,
            done: nextDone,
            note: note ?? current.note,
            doneBy: nextDone ? current.doneBy || actorId : null,
            doneAt: nextDone ? current.doneAt || new Date().toISOString() : null,
          }
        : task,
    );
    const changed = await db.supportTicket.updateMany({
      where: { id, returnedAt: before.returnedAt },
      data: { returnTasks },
    });
    if (changed.count !== 1) return null;
    await audit.record(
      {
        ticketId: id,
        actorId,
        action: "RETURN_TASK",
        toValue: taskId,
        reason: `${returnTasks[index].done ? "done" : "open"}: ${returnTasks[index].text}`,
      },
      db,
    );
    return { returnTasks, returnedAt: before.returnedAt };
  }, client);
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
    const existing = await db.ticketChatMessageReceipt.findUnique({
      where: { messageId: chatMessageId },
    });
    if (existing) {
      if (existing.ticketId !== row.id)
        throw badRequest("Chat message belongs to another ticket");
      // The receipt decides deduplication. Fetch the historical audit only to
      // preserve the internal API's existing event response, never for state.
      const event = await db.ticketAuditLog.findUnique({
        where: { dedupeKey },
      });
      if (!event)
        throw new AppError(503, "Chat receipt audit history is unavailable");
      return { event, alreadyRecorded: true };
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
    await db.ticketChatMessageReceipt.create({
      data: {
        messageId: chatMessageId,
        ticketId: row.id,
        conversationId: row.chatLink?.conversationId || conversationId,
        authorId: authorId || null,
        authorRole: resolvedRole,
        isInternal: Boolean(isInternal),
        messageCreatedAt: date,
      },
    });
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
      const snapshot = await db.supportTicket.findUnique({
        where: { id: row.id },
        include: ticketInclude,
      });
      const response = events
        .effectiveTargets(snapshot.slaTargets, snapshot.auditLog)
        .find((t) => t.metricType === "FIRST_RESPONSE");
      if (response && date >= new Date(response.round.startedAt))
        await db.ticketSlaTarget.updateMany({
          where: {
            id: response.id,
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

async function markOverdue(ticketId, now) {
  return transaction(async (db) => {
    const ticket = await db.supportTicket.findUnique({
      where: { id: ticketId },
      include: ticketInclude,
    });
    if (!ticket || ["CLOSED", "RESOLVED"].includes(ticket.currentStatus.code))
      return false;
    const overdue = events
      .effectiveTargets(ticket.slaTargets, ticket.auditLog)
      .filter((t) => !t.achievedAt && !t.breachedAt && t.dueAt <= now);
    if (!overdue.length) return false;
    const marked = await db.ticketSlaTarget.updateMany({
      where: {
        id: { in: overdue.map((t) => t.id) },
        achievedAt: null,
        breachedAt: null,
      },
      data: { breachedAt: now },
    });
    if (marked.count)
      await audit.record(
        {
          ticketId,
          actorId: "system:sla",
          action: "SLA_BREACH",
          reason: "SLA breached",
          payload: { metricTypes: overdue.map((t) => t.metricType) },
          createdAt: now,
        },
        db,
      );
    return marked.count > 0;
  });
}
async function reassign({
  id,
  version,
  assigneeId,
  assignedById = assigneeId,
  reason,
}) {
  return transaction(async (db) => {
    const before = await db.supportTicket.findUnique({
      where: { id },
      include: ticketInclude,
    });
    if (!before || before.currentStatus.code !== "ESCALATED") return false;
    const changed = await db.supportTicket.updateMany({
      where: { id, version },
      data: { version: { increment: 1 } },
    });
    if (!changed.count) return false;
    const now = new Date();
    const previous =
      before.assignments.find((a) => !a.endedAt)?.assigneeId || null;
    await db.ticketAssignment.updateMany({
      where: { ticketId: id, endedAt: null },
      data: { endedAt: now, endReason: "TAKEOVER" },
    });
    await db.ticketAssignment.create({
      data: { ticketId: id, assigneeId, assignedById, assignedAt: now },
    });
    await audit.record(
      {
        ticketId: id,
        actorId: assignedById,
        action: "HANDOFF",
        fromValue: previous,
        toValue: assigneeId,
        reason,
        createdAt: now,
      },
      db,
    );
    return true;
  });
}
async function dashboardMetrics({ includeEscalated, days }) {
  const where = includeEscalated
    ? {}
    : { currentStatus: { code: { not: "ESCALATED" } } };
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (days - 1));
  const [total, statusRows, priorityRows, statuses, priorities, created] =
    await Promise.all([
      prisma.supportTicket.count({ where }),
      prisma.supportTicket.groupBy({
        by: ["currentStatusId"],
        where,
        _count: { _all: true },
      }),
      prisma.supportTicket.groupBy({
        by: ["priorityId"],
        where,
        _count: { _all: true },
      }),
      prisma.ticketStatus.findMany(),
      prisma.ticketPriority.findMany(),
      prisma.supportTicket.findMany({
        where: { ...where, createdAt: { gte: since } },
        select: { createdAt: true },
      }),
    ]);
  const buckets = new Map(
    Array.from({ length: days }, (_, i) => {
      const d = new Date(since);
      d.setUTCDate(d.getUTCDate() + i);
      return [d.toISOString().slice(0, 10), 0];
    }),
  );
  for (const r of created) {
    const key = r.createdAt.toISOString().slice(0, 10);
    if (buckets.has(key)) buckets.set(key, buckets.get(key) + 1);
  }
  return {
    total,
    status: Object.fromEntries(
      statusRows.map((r) => [
        statuses.find((s) => s.id === r.currentStatusId)?.code,
        r._count._all,
      ]),
    ),
    priority: Object.fromEntries(
      priorityRows.map((r) => [
        priorities.find((p) => p.id === r.priorityId)?.code,
        r._count._all,
      ]),
    ),
    trend: [...buckets].map(([date, count]) => ({ date, count })),
    hourlyTrend: dashboardHourlyTrend(created),
  };
}
module.exports = {
  ratingsFor,
  reassign,
  dashboardMetrics,
  create,
  findById,
  listByRequester,
  listQueue,
  assign,
  transitionStatus,
  returnToCs,
  updateReturnTask,
  setConversationId,
  recordChatMessage,
  markOverdue,
  queueFilter,
};
