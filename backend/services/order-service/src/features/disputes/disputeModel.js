const { conflict, notFound } = require("@reloop/shared");
const prisma = require("../../models/prismaClient");
const orderModel = require("../../models/orderModel");
const transitions = require("../../services/orderTransitionService");
const {
  INCLUDE: EVIDENCE_INCLUDE,
  view: evidenceView,
} = require("./evidenceView");
const INCLUDE = {
  evidence: { include: EVIDENCE_INCLUDE },
  order: { include: orderModel.INCLUDE },
  caseLog: { orderBy: { createdAt: "asc" } },
};
function caseView(row) {
  if (!row) return null;
  return {
    ...orderModel.disputeView(row),
    evidence: (row.evidence || []).map(evidenceView),
    auditLog: (row.caseLog || []).map((log) => ({
      ...log,
      disputeId: log.disputeCaseId,
    })),
    ...(row.order ? { order: orderModel.view(row.order) } : {}),
  };
}
async function findByOrderId(orderId) {
  return caseView(
    await prisma.disputeCase.findUnique({
      where: { orderId },
      include: INCLUDE,
    }),
  );
}
async function findById(id) {
  return caseView(
    await prisma.disputeCase.findUnique({ where: { id }, include: INCLUDE }),
  );
}
async function findEvidence(disputeId, evidenceId) {
  return evidenceView(
    await prisma.disputeEvidence.findFirst({
      where: { id: evidenceId, disputeCaseId: disputeId },
      include: EVIDENCE_INCLUDE,
    }),
  );
}
function caseLogData(before, after, actorId, action, detail) {
  return {
    disputeCaseId: before.id,
    actorId,
    action,
    detail,
    fromAssignedTo: before.assignedTo ?? null,
    toAssignedTo: after.assignedTo ?? null,
    fromAssignedRole: before.assignedRole ?? null,
    toAssignedRole: after.assignedRole ?? null,
  };
}
async function auditLog(data) {
  const evidenceId = data.disputeEvidenceId || data.evidenceId;
  if (evidenceId)
    return prisma.disputeAuditLog.create({
      data: {
        disputeEvidenceId: evidenceId,
        actorId: data.actorId,
        action: data.action,
        detail: data.detail || data.action,
      },
    });
  const dispute = await prisma.disputeCase.findUnique({
    where: { id: data.disputeId },
  });
  if (!dispute) throw notFound("dispute not found");
  return prisma.disputeCaseLog.create({
    data: caseLogData(
      dispute,
      dispute,
      data.actorId,
      data.action,
      data.detail || data.action,
    ),
  });
}
async function addEvidence({
  disputeId,
  uploaderId,
  storageKey,
  fileType,
  evidenceDeadline = null,
  caseVersion,
  assignedTo,
}) {
  return prisma.$transaction(async (tx) => {
    const dispute = await tx.disputeCase.findUnique({
      where: { id: disputeId },
    });
    if (!dispute) throw notFound("dispute not found");
    const changed = await tx.disputeCase.updateMany({
      where: {
        id: disputeId,
        decision: null,
        version: caseVersion,
        ...(assignedTo ? { assignedTo } : {}),
      },
      data: { version: { increment: 1 } },
    });
    if (changed.count !== 1)
      throw conflict("dispute changed during evidence upload");
    const row = await tx.disputeEvidence.create({
      data: {
        disputeCaseId: disputeId,
        uploaderId,
        files: { create: { refPath: storageKey } },
        fileType,
        status: "SUBMITTED",
        evidenceDeadline,
      },
      include: EVIDENCE_INCLUDE,
    });
    await tx.disputeAuditLog.create({
      data: {
        disputeEvidenceId: row.id,
        actorId: uploaderId,
        action: "UPLOAD",
        detail: "Evidence uploaded to case " + disputeId,
      },
    });
    return evidenceView(row);
  });
}
async function setEvidenceDeadline({
  disputeId,
  evidenceId,
  actorId,
  deadline,
  version,
  caseVersion,
}) {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.disputeCase.updateMany({
      where: {
        id: disputeId,
        assignedTo: actorId,
        version: caseVersion,
        decision: null,
      },
      data: { version: { increment: 1 } },
    });
    if (claimed.count !== 1) throw conflict("case ownership or state changed");
    const changed = await tx.disputeEvidence.updateMany({
      where: { id: evidenceId, disputeCaseId: disputeId, version },
      data: { evidenceDeadline: deadline, version: { increment: 1 } },
    });
    if (changed.count !== 1)
      throw conflict("evidence changed — reload and retry");
    await tx.disputeAuditLog.create({
      data: {
        disputeEvidenceId: evidenceId,
        actorId,
        action: "DEADLINE_SET",
        detail: deadline.toISOString(),
      },
    });
    return evidenceView(
      await tx.disputeEvidence.findUnique({
        where: { id: evidenceId },
        include: EVIDENCE_INCLUDE,
      }),
    );
  });
}
async function listQueue(
  {
    status,
    assignedRole,
    search,
    skip,
    take,
    scope,
    work,
    replyIds,
    now = new Date(),
    userId,
    restricted,
    priority,
    sort = "sla",
  },
  db = prisma,
) {
  const where = {};
  const filters = [];
  if (work === "reply") filters.push({ id: { in: replyIds || [] } });
  if (work) {
    if (restricted)
      filters.push({
        OR: [{ assignedRole: null }, { assignedRole: "CUSTOMER_SERVICE" }],
      });
    filters.push({ status: { in: ["OPEN", "NEEDS_INFO"] } });
    if (work === "overdue") filters.push({ slaExpiresAt: { lte: now } });
    if (work === "soon")
      filters.push({
        slaExpiresAt: {
          gt: now,
          lte: new Date(
            +now +
              require("@reloop/shared").customerServiceClientConfig.dashboard
                .warningMinutes *
                60000,
          ),
        },
      });
  }
  if (restricted)
    filters.push(
      { OR: [{ assignedRole: null }, { assignedRole: { not: "ADMIN" } }] },
      { OR: [{ assignedTo: null }, { assignedTo: userId }] },
    );
  if (scope === "mine") filters.push({ assignedTo: userId });
  if (scope === "unassigned") filters.push({ assignedTo: null });
  if (scope && scope !== "all" && !status)
    filters.push({ status: { not: "DECIDED" } });
  if (filters.length) where.AND = filters;
  if (priority) where.priority = priority;
  if (assignedRole) where.assignedRole = assignedRole;
  if (status) {
    where.status = status;
  }
  if (search) {
    where.OR = [
      { reason: { contains: search, mode: "insensitive" } },
      { orderId: { contains: search, mode: "insensitive" } },
      { id: { contains: search, mode: "insensitive" } },
    ];
  }

  const sorts = {
    sla: [
      { slaExpiresAt: { sort: "asc", nulls: "last" } },
      { priorityScore: "desc" },
      { id: "asc" },
    ],
    newest: [{ createdAt: "desc" }, { id: "asc" }],
    oldest: [{ createdAt: "asc" }, { id: "asc" }],
    priority: [{ priorityScore: "desc" }, { id: "asc" }],
  };
  if (sort === "priority") {
    // Rank persisted labels across legacy and v2 scores before pagination.
    const groups = [
      { in: ["URGENT", "CRITICAL"] },
      "HIGH",
      "NORMAL",
      "LOW",
      { notIn: ["URGENT", "CRITICAL", "HIGH", "NORMAL", "LOW"] },
    ];
    const predicates = groups.map((priority) => ({
      ...where,
      AND: [...(where.AND || []), { priority }],
    }));
    const counts = await Promise.all(
      predicates.map((where) => db.disputeCase.count({ where })),
    );
    const items = [];
    let offset = skip || 0;
    const limit = take ?? 20;
    for (let i = 0; i < predicates.length && items.length < limit; i++) {
      if (offset >= counts[i]) {
        offset -= counts[i];
        continue;
      }
      items.push(
        ...(await db.disputeCase.findMany({
          where: predicates[i],
          orderBy: sorts.sla,
          skip: offset,
          take: limit - items.length,
          include: {
            order: { include: orderModel.INCLUDE },
            evidence: { include: EVIDENCE_INCLUDE },
            caseLog: true,
          },
        })),
      );
      offset = 0;
    }
    return {
      items: items.map(caseView),
      total: counts.reduce((sum, count) => sum + count, 0),
    };
  }
  if (sort === "sla") {
    // Completed cases have no active deadline. Paginate the ordered active
    // partition first, then terminal history; never sort only a loaded page.
    const activeWhere = {
      ...where,
      AND: [...(where.AND || []), { status: { not: "DECIDED" } }],
    };
    const [activeTotal, total] = await Promise.all([
      db.disputeCase.count({ where: activeWhere }),
      db.disputeCase.count({ where }),
    ]);
    const activeItems = await db.disputeCase.findMany({
      where: activeWhere,
      orderBy: sorts.sla,
      skip,
      take,
      include: {
        order: { include: orderModel.INCLUDE },
        evidence: { include: EVIDENCE_INCLUDE },
        caseLog: true,
      },
    });
    const terminalItems =
      activeItems.length < take
        ? await db.disputeCase.findMany({
            where: {
              ...where,
              AND: [...(where.AND || []), { status: "DECIDED" }],
            },
            orderBy: [{ createdAt: "desc" }, { id: "asc" }],
            skip: Math.max(0, skip - activeTotal),
            take: take - activeItems.length,
            include: {
              order: { include: orderModel.INCLUDE },
              evidence: { include: EVIDENCE_INCLUDE },
              caseLog: true,
            },
          })
        : [];
    return { items: [...activeItems, ...terminalItems].map(caseView), total };
  }
  const [items, total] = await Promise.all([
    db.disputeCase.findMany({
      where,
      orderBy: sorts[sort],
      skip,
      take,
      include: {
        order: { include: orderModel.INCLUDE },
        evidence: { include: EVIDENCE_INCLUDE },
        caseLog: true,
      },
    }),
    db.disputeCase.count({ where }),
  ]);

  return { items: items.map(caseView), total };
}
async function openDispute({
  orderId,
  openedBy,
  reason,
  disputeType,
  expectedVersion,
  priority,
  priorityScore,
  riskReportCount,
  slaExpiresAt,
  slaPolicyVersion,
  firstReviewDueAt,
  decisionDueAt,
  createdAt,
  classification,
}) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) throw notFound("order not found");
    const changed = await tx.order.updateMany({
      where: {
        id: orderId,
        version: expectedVersion ?? order.version,
        status: { in: ["delivered", "completed", "disputed"] },
      },
      data: {
        status: "disputed",
        preDisputeStatus: order.preDisputeStatus || order.status,
        version: { increment: 1 },
      },
    });
    if (changed.count !== 1)
      throw conflict(
        "order state was modified concurrently — reload and retry",
      );
    const dispute = await tx.disputeCase.create({
      data: {
        orderId,
        createdBy: openedBy,
        reason,
        disputeType,
        priority,
        priorityScore,
        riskReportCount,
        slaExpiresAt,
        slaPolicyVersion,
        firstReviewDueAt,
        decisionDueAt,
        createdAt,
      },
    });
    await transitions.addHold(tx, {
      orderId,
      source: "DISPUTE",
      referenceId: dispute.id,
      reason,
      holdBy: openedBy,
    });
    await tx.disputeCaseLog.create({
      data: caseLogData(
        dispute,
        dispute,
        openedBy,
        "OPEN",
        classification ? JSON.stringify(classification) : reason,
      ),
    });
    return caseView({ ...dispute, evidence: [] });
  });
}
async function changeAssignment({
  id,
  version,
  actorId,
  action,
  detail,
  data,
  claimRole,
}) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.disputeCase.findUnique({ where: { id } });
    if (!before) return null;
    const where = { id, version, decision: null };
    if (action === "CLAIM") {
      where.assignedTo = null;
      if (claimRole !== "TRUST_AND_SAFETY" && claimRole !== "ADMIN")
        where.OR = [
          { assignedRole: null },
          { assignedRole: { notIn: ["TRUST_AND_SAFETY", "ADMIN"] } },
        ];
    }
    if (action === "REQUEST_MORE_EVIDENCE") {
      where.assignedTo = actorId;
      where.assignedRole = "ADMIN";
    }
    const firstReview =
      ["CLAIM", "REASSIGN", "ESCALATE"].includes(action) &&
      before.slaPolicyVersion &&
      !before.firstReviewedAt &&
      before.decisionDueAt
        ? {
            firstReviewedAt: data.assignedAt || new Date(),
            slaExpiresAt: before.decisionDueAt,
          }
        : {};
    const changed = await tx.disputeCase.updateMany({
      where,
      data: { ...data, ...firstReview, version: { increment: 1 } },
    });
    if (changed.count !== 1) return null;
    const after = await tx.disputeCase.findUnique({
      where: { id },
      include: INCLUDE,
    });
    await tx.disputeCaseLog.create({
      data: caseLogData(before, after, actorId, action, detail),
    });
    return caseView(after);
  });
}
async function claim({ id, version, userId, role }) {
  return changeAssignment({
    id,
    version,
    actorId: userId,
    action: "CLAIM",
    detail: "Case claimed by " + userId,
    claimRole: role,
    data: { assignedTo: userId, assignedRole: role, assignedAt: new Date() },
  });
}
function reassign({ id, version, actorId, toUserId, toRole, reason }) {
  return changeAssignment({
    id,
    version,
    actorId,
    action: "REASSIGN",
    detail: reason,
    data: {
      assignedTo: toUserId,
      assignedRole: toRole,
      assignedAt: new Date(),
    },
  });
}
function escalate({ id, version, actorId, toUserId, reason }) {
  return changeAssignment({
    id,
    version,
    actorId,
    action: "ESCALATE",
    detail: reason,
    data: {
      assignedTo: toUserId || null,
      assignedRole: "ADMIN",
      escalatedBy: actorId,
      escalationNote: reason,
      assignedAt: toUserId ? new Date() : null,
    },
  });
}
async function decide({
  id,
  version,
  expectedOrderVersion,
  decision,
  decisionReason,
  decidedBy,
  verdictKey,
}) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.disputeCase.findUnique({ where: { id } });
    if (!before) return null;
    const changed = await tx.disputeCase.updateMany({
      where: {
        id,
        version,
        decision: null,
        assignedTo: decidedBy,
        assignedRole: "ADMIN",
      },
      data: {
        decision,
        status: "DECIDED",
        verdictKey,
        decisionReason,
        decidedBy,
        decidedAt: new Date(),
        version: { increment: 1 },
      },
    });
    if (changed.count !== 1) return null;
    await transitions.releaseHold(tx, {
      orderId: before.orderId,
      source: "DISPUTE",
      referenceId: id,
      releasedBy: decidedBy,
    });
    const state = await transitions.resolveHoldState(tx, before.orderId);
    const orderChanged = await tx.order.updateMany({
      where: {
        id: before.orderId,
        version: expectedOrderVersion,
        status: "disputed",
      },
      data: { status: state.nextStatus, version: { increment: 1 } },
    });
    if (orderChanged.count !== 1)
      throw conflict(
        "order state was modified concurrently — reload and retry",
      );
    const after = await tx.disputeCase.findUnique({
      where: { id },
      include: INCLUDE,
    });
    await tx.disputeCaseLog.create({
      data: caseLogData(
        before,
        after,
        decidedBy,
        "DECIDE",
        decision + ": " + decisionReason,
      ),
    });
    return caseView(after);
  });
}
async function requestMoreEvidence({ id, version, actorId, reason }) {
  const before = await prisma.disputeCase.findUnique({ where: { id } });
  if (!before || before.decision) return null;
  return changeAssignment({
    id,
    version,
    actorId,
    action: "REQUEST_MORE_EVIDENCE",
    detail: reason,
    data: {
      status: "NEEDS_INFO",
      assignedTo: before.escalatedBy,
      assignedRole: "CUSTOMER_SERVICE",
      assignedAt: before.escalatedBy ? new Date() : null,
      escalationNote: reason,
    },
  });
}
async function dashboardMetrics() {
  const rows = await prisma.disputeCase.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  return {
    disputesByStatus: Object.fromEntries(
      rows.map((row) => [row.status, row._count._all]),
    ),
  };
}

module.exports = {
  dashboardMetrics,
  requestMoreEvidence,
  findByOrderId,
  findById,
  findEvidence,
  addEvidence,
  auditLog,
  setEvidenceDeadline,
  listQueue,
  openDispute,
  claim,
  reassign,
  escalate,
  decide,
  caseView,
};
