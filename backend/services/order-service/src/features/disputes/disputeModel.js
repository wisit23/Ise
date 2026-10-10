const {
  customerServicePolicy,
  addMinutes,
  conflict,
  notFound,
} = require("@reloop/shared");

const prisma = require("../../models/prismaClient");
const orderTransitionService = require("../../services/orderTransitionService");

async function recordFirstReview(tx, dispute, at = new Date()) {
  if (
    !dispute.slaPolicyVersion ||
    dispute.firstReviewedAt ||
    !dispute.decisionDueAt
  )
    return dispute;
  // Explicit staff claim or routing acknowledges triage. Never restart decision.
  return tx.disputeCase.update({
    where: { id: dispute.id },
    data: {
      firstReviewedAt: at,
      slaExpiresAt: dispute.decisionDueAt,
    },
    include: { evidence: true },
  });
}

function findByOrderId(orderId) {
  return prisma.disputeCase.findUnique({
    where: { orderId },
    include: { evidence: true },
  });
}

function findById(id) {
  return prisma.disputeCase.findUnique({
    where: { id },
    include: { evidence: true },
  });
}

function findEvidence(disputeId, evidenceId) {
  return prisma.disputeEvidence.findFirst({
    where: { id: evidenceId, disputeId },
  });
}

function addEvidence(data) {
  return prisma.disputeEvidence.create({ data });
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
          include: { order: true },
        })),
      );
      offset = 0;
    }
    return { items, total: counts.reduce((sum, count) => sum + count, 0) };
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
      include: { order: true },
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
            include: { order: true },
          })
        : [];
    return { items: [...activeItems, ...terminalItems], total };
  }
  const [items, total] = await Promise.all([
    db.disputeCase.findMany({
      where,
      orderBy: sorts[sort],
      skip,
      take,
      include: { order: true },
    }),
    db.disputeCase.count({ where }),
  ]);

  return { items, total };
}

function auditLog(data) {
  return prisma.disputeAuditLog.create({ data });
}

/** Opens a dispute and puts the order into `disputed` + payout-held, atomically. */
function openDispute({
  orderId,
  openedBy,
  reason,
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
    const existingOrder = await tx.order.findUnique({ where: { id: orderId } });
    if (!existingOrder) throw notFound("order not found");

    const targetVersion =
      typeof expectedVersion === "number"
        ? expectedVersion
        : existingOrder.version;

    const preDispute =
      existingOrder.preDisputeStatus &&
      existingOrder.preDisputeStatus !== "disputed"
        ? existingOrder.preDisputeStatus
        : existingOrder.status === "disputed"
          ? "completed"
          : existingOrder.status || "completed";

    // Atomic CAS transition on Order
    const { count } = await tx.order.updateMany({
      where: {
        id: orderId,
        version: targetVersion,
        status: { in: ["completed", "disputed"] },
      },
      data: {
        status: "disputed",
        payoutHeld: true,
        disputedAt: existingOrder.disputedAt || new Date(),
        preDisputeStatus: preDispute,
        version: { increment: 1 },
      },
    });
    if (count === 0) {
      throw conflict(
        "order state was modified concurrently — reload and retry",
      );
    }

    const dispute = await tx.disputeCase.create({
      data: {
        orderId,
        openedBy,
        reason,
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

    await orderTransitionService.addHold(tx, {
      orderId,
      source: "DISPUTE",
      referenceId: dispute.id,
      reason,
      heldBy: openedBy,
    });
    await tx.disputeAuditLog.create({
      data: {
        disputeId: dispute.id,
        actorId: openedBy,
        action: "OPEN",
        ...(classification ? { detail: JSON.stringify(classification) } : {}),
      },
    });
    return dispute;
  });
}

/** Claim dispute: only succeeds if currently unassigned and at matching version. */
async function claim({ id, version, userId, role }) {
  return prisma.$transaction(async (tx) => {
    const where = {
      id,
      version,
      assignedTo: null,
      status: { in: ["OPEN", "NEEDS_INFO"] },
    };
    if (role !== "TRUST_AND_SAFETY" && role !== "ADMIN") {
      where.OR = [
        { assignedRole: null },
        { assignedRole: { notIn: ["TRUST_AND_SAFETY", "ADMIN"] } },
      ];
    }

    const { count } = await tx.disputeCase.updateMany({
      where,
      data: {
        assignedTo: userId,
        assignedRole: role,
        claimedAt: new Date(),
        version: { increment: 1 },
      },
    });
    if (count === 0) return null;

    const dispute = await tx.disputeCase.findUnique({
      where: { id },
      include: { evidence: true },
    });

    await tx.disputeAuditLog.create({
      data: {
        disputeId: id,
        actorId: userId,
        action: "CLAIM",
        detail: `claimed by ${userId} (${role})`,
      },
    });

    return recordFirstReview(tx, dispute, dispute.claimedAt);
  });
}

/** Reassign dispute: transfers ownership to another staff member. */
async function reassign({ id, version, actorId, toUserId, toRole, reason }) {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.disputeCase.updateMany({
      where: {
        id,
        version,
        status: { in: ["OPEN", "NEEDS_INFO"] },
      },
      data: {
        assignedTo: toUserId,
        assignedRole: toRole,
        claimedAt: new Date(),
        version: { increment: 1 },
      },
    });
    if (count === 0) return null;

    const dispute = await tx.disputeCase.findUnique({
      where: { id },
      include: { evidence: true },
    });

    await tx.disputeAuditLog.create({
      data: {
        disputeId: id,
        actorId,
        action: "REASSIGN",
        detail: `reassigned to ${toUserId} (${toRole}): ${reason}`,
      },
    });

    return recordFirstReview(tx, dispute, dispute.claimedAt);
  });
}

/** Escalate dispute: transfers ownership to Admin verdict queue. */
async function escalate({ id, version, actorId, toUserId, reason }) {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.disputeCase.updateMany({
      where: {
        id,
        version,
        status: { in: ["OPEN", "NEEDS_INFO"] },
      },
      data: {
        assignedTo: toUserId || null,
        assignedRole: "ADMIN",
        escalationNote: reason,
        escalatedBy: actorId,
        claimedAt: toUserId ? new Date() : null,
        version: { increment: 1 },
      },
    });
    if (count === 0) return null;

    const dispute = await tx.disputeCase.findUnique({
      where: { id },
      include: { evidence: true },
    });

    await tx.disputeAuditLog.create({
      data: {
        disputeId: id,
        actorId,
        action: "ESCALATE",
        detail: `escalated to ADMIN: ${reason}`,
      },
    });

    return recordFirstReview(tx, dispute, dispute.claimedAt || new Date());
  });
}

/** One-way decision: only succeeds while the dispute is still OPEN/NEEDS_INFO
 * at `version` — the optimistic lock is what makes "exactly one decision"
 * hold even under a race between two agents. */
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
    const { count } = await tx.disputeCase.updateMany({
      where: { id, version, status: { in: ["OPEN", "NEEDS_INFO"] } },
      data: {
        status: "DECIDED",
        decision,
        decisionReason,
        decidedBy,
        verdictKey,
        decidedAt: new Date(),
        version: { increment: 1 },
      },
    });
    if (count === 0) return null;

    const dispute = await tx.disputeCase.findUnique({ where: { id } });

    // Release only the DISPUTE hold (TSR-02: does not release T&S Hold)
    await orderTransitionService.releaseHold(tx, {
      orderId: dispute.orderId,
      source: "DISPUTE",
      referenceId: id,
      reason: decisionReason,
      releasedBy: decidedBy,
    });

    // Recalculate hold state and safe next status
    const holdState = await orderTransitionService.resolveHoldState(
      tx,
      dispute.orderId,
    );

    const orderStatus =
      decision === "APPROVE_REFUND"
        ? "refunded"
        : holdState?.nextStatus || "completed";
    const isPayoutHeld = Boolean(holdState?.isPayoutHeld);

    const orderWhere = {
      id: dispute.orderId,
      status: "disputed",
    };
    if (typeof expectedOrderVersion === "number") {
      orderWhere.version = expectedOrderVersion;
    }

    const { count: orderCount } = await tx.order.updateMany({
      where: orderWhere,
      data: {
        status: orderStatus,
        payoutHeld: isPayoutHeld,
        version: { increment: 1 },
      },
    });
    if (orderCount === 0) {
      throw conflict(
        "order state was modified concurrently — reload and retry",
      );
    }

    await tx.disputeAuditLog.create({
      data: {
        disputeId: id,
        actorId: decidedBy,
        action: "DECIDE",
        detail: `${decision}: ${decisionReason}`,
      },
    });
    return dispute;
  });
}

async function requestMoreEvidence({ id, version, actorId, reason }) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.disputeCase.findUnique({ where: { id } });
    if (!current || current.status === "DECIDED") return null;
    const { count } = await tx.disputeCase.updateMany({
      where: {
        id,
        version,
        status: { in: ["OPEN", "NEEDS_INFO"] },
        assignedTo: actorId,
        assignedRole: "ADMIN",
      },
      data: {
        status: "NEEDS_INFO",
        assignedTo: current.escalatedBy,
        assignedRole: "CUSTOMER_SERVICE",
        claimedAt: current.escalatedBy ? new Date() : null,
        evidenceDeadline: addMinutes(
          new Date(),
          customerServicePolicy.evidenceResponseMinutes,
        ),
        escalationNote: reason,
        version: { increment: 1 },
      },
    });
    if (!count) return null;
    await tx.disputeAuditLog.create({
      data: {
        disputeId: id,
        actorId,
        action: "REQUEST_MORE_EVIDENCE",
        detail: reason,
      },
    });
    return tx.disputeCase.findUnique({
      where: { id },
      include: { evidence: true },
    });
  });
}

module.exports = {
  findByOrderId,
  findById,
  findEvidence,
  addEvidence,
  auditLog,
  openDispute,
  claim,
  reassign,
  escalate,
  decide,
  requestMoreEvidence,
  listQueue,
};
