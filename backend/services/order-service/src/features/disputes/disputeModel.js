const prisma = require("../../models/prismaClient");

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

async function listQueue({ status, search, skip, take }) {
  const where = {};
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
      orderBy: { createdAt: "desc" },
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
function openDispute({ orderId, openedBy, reason }) {
  return prisma.$transaction(async (tx) => {
    const dispute = await tx.disputeCase.create({
      data: { orderId, openedBy, reason },
    });
    await tx.order.update({
      where: { id: orderId },
      data: { status: "disputed", payoutHeld: true, disputedAt: new Date() },
    });
    await tx.disputeAuditLog.create({
      data: { disputeId: dispute.id, actorId: openedBy, action: "OPEN" },
    });
    return dispute;
  });
}

/** One-way decision: only succeeds while the dispute is still OPEN/NEEDS_INFO
 * at `version` — the optimistic lock is what makes "exactly one decision"
 * hold even under a race between two agents. */
async function decide({ id, version, decision, decisionReason, decidedBy }) {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.disputeCase.updateMany({
      where: { id, version, status: { in: ["OPEN", "NEEDS_INFO"] } },
      data: {
        status: "DECIDED",
        decision,
        decisionReason,
        decidedBy,
        decidedAt: new Date(),
        version: { increment: 1 },
      },
    });
    if (count === 0) return null;

    const dispute = await tx.disputeCase.findUnique({ where: { id } });
    const orderStatus =
      decision === "APPROVE_REFUND" ? "refunded" : "completed";
    await tx.order.update({
      where: { id: dispute.orderId },
      data: { status: orderStatus, payoutHeld: false },
    });
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

module.exports = {
  findByOrderId,
  findById,
  findEvidence,
  addEvidence,
  auditLog,
  openDispute,
  decide,
  listQueue,
};
