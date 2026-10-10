const { conflict, notFound } = require("@reloop/shared");
const prisma = require("../../models/prismaClient");
const orderModel = require("../../models/orderModel");
const transitions = require("../../services/orderTransitionService");
const INCLUDE = { evidence: true, caseLog: { orderBy: { createdAt: "asc" } } };
function evidenceView(row) {
  return (
    row && {
      ...row,
      disputeId: row.disputeCaseId,
      storageKey: row.evidencePath,
    }
  );
}
function caseView(row) {
  if (!row) return null;
  return {
    ...orderModel.disputeView(row),
    evidence: (row.evidence || []).map(evidenceView),
    auditLog: row.caseLog || [],
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
async function auditLog({
  disputeEvidenceId,
  evidenceId,
  actorId,
  action,
  detail,
}) {
  return prisma.disputeAuditLog.create({
    data: {
      disputeEvidenceId: disputeEvidenceId || evidenceId,
      actorId,
      action,
      detail,
    },
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
        evidencePath: storageKey,
        fileType,
        status: "SUBMITTED",
        evidenceDeadline,
      },
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
      await tx.disputeEvidence.findUnique({ where: { id: evidenceId } }),
    );
  });
}
async function listQueue({ status, search, skip, take }) {
  const where = {};
  if (status === "DECIDED") where.decision = { not: null };
  else if (status === "OPEN") {
    where.decision = null;
    where.evidence = { none: { status: "NEEDS_INFO" } };
  } else if (status === "NEEDS_INFO") {
    where.decision = null;
    where.evidence = { some: { status: "NEEDS_INFO" } };
  }
  if (search)
    where.OR = [
      { reason: { contains: search, mode: "insensitive" } },
      { orderId: { contains: search, mode: "insensitive" } },
    ];
  const [items, total] = await Promise.all([
    prisma.disputeCase.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: { ...INCLUDE, order: { include: orderModel.INCLUDE } },
    }),
    prisma.disputeCase.count({ where }),
  ]);
  return { items: items.map(caseView), total };
}
async function openDispute({
  orderId,
  openedBy,
  reason,
  disputeType,
  expectedVersion,
}) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) throw notFound("order not found");
    const changed = await tx.order.updateMany({
      where: {
        id: orderId,
        version: expectedVersion ?? order.version,
        status: { in: ["completed", "disputed"] },
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
      data: { orderId, createdBy: openedBy, reason, disputeType },
    });
    await transitions.addHold(tx, {
      orderId,
      source: "DISPUTE",
      referenceId: dispute.id,
      reason,
      holdBy: openedBy,
    });
    await tx.disputeCaseLog.create({
      data: caseLogData(dispute, dispute, openedBy, "OPEN", reason),
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
      if (claimRole !== "TRUST_AND_SAFETY")
        where.OR = [
          { assignedRole: null },
          { assignedRole: { not: "TRUST_AND_SAFETY" } },
        ];
    }
    const changed = await tx.disputeCase.updateMany({
      where,
      data: { ...data, version: { increment: 1 } },
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
function claim({ id, version, userId, role }) {
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
      assignedRole: "TRUST_AND_SAFETY",
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
}) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.disputeCase.findUnique({ where: { id } });
    if (!before) return null;
    const changed = await tx.disputeCase.updateMany({
      where: { id, version, decision: null, assignedTo: decidedBy },
      data: {
        decision,
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
module.exports = {
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
