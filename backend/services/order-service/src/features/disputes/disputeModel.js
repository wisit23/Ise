const { conflict, notFound } = require("@reloop/shared");
const prisma = require("../../models/prismaClient");
const orderTransitionService = require("../../services/orderTransitionService");

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

async function listQueue({ status, assignedRole, search, skip, take }) {
  const where = {};
  if (assignedRole) where.assignedRole = assignedRole;
  if (status) {
    where.status = status;
  }
  if (search) {
    where.OR = [
      { reason: { contains: search, mode: "insensitive" } },
      { orderId: { contains: search, mode: "insensitive" } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.disputeCase.findMany({
      where,
      orderBy: [{ slaExpiresAt: "asc" }, { priorityScore: "desc" }, { createdAt: "asc" }],
      skip,
      take,
      include: { order: true },
    }),
    prisma.disputeCase.count({ where }),
  ]);

  return { items, total };
}

function auditLog(data) {
  return prisma.disputeAuditLog.create({ data });
}

/** Opens a dispute and puts the order into `disputed` + payout-held, atomically. */
function openDispute({ orderId, openedBy, reason, expectedVersion, priority, priorityScore, riskReportCount, slaExpiresAt }) {
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
      data: { orderId, openedBy, reason, priority, priorityScore, riskReportCount, slaExpiresAt },
    });

    await orderTransitionService.addHold(tx, {
      orderId,
      source: "DISPUTE",
      referenceId: dispute.id,
      reason,
      heldBy: openedBy,
    });
    await tx.disputeAuditLog.create({
      data: { disputeId: dispute.id, actorId: openedBy, action: "OPEN" },
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

    return dispute;
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

    return dispute;
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

    return dispute;
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
      where: { id, version, status: { in: ["OPEN", "NEEDS_INFO"] }, assignedTo: actorId, assignedRole: "ADMIN" },
      data: {
        status: "NEEDS_INFO",
        assignedTo: current.escalatedBy,
        assignedRole: "CUSTOMER_SERVICE",
        claimedAt: current.escalatedBy ? new Date() : null,
        evidenceDeadline: new Date(Date.now() + 48 * 60 * 60 * 1000),
        escalationNote: reason,
        version: { increment: 1 },
      },
    });
    if (!count) return null;
    await tx.disputeAuditLog.create({ data: { disputeId: id, actorId, action: "REQUEST_MORE_EVIDENCE", detail: reason } });
    return tx.disputeCase.findUnique({ where: { id }, include: { evidence: true } });
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
