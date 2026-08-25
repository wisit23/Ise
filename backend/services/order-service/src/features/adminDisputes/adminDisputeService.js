const { badRequest, conflict, notFound } = require("@reloop/shared");
const prisma = require("../../models/prismaClient");

/** Append-only — never updated or deleted (ADM-DEC-003: evidence must persist). */
async function recordAudit({ orderId, actorId, action, reason }) {
  return prisma.disputeAudit.create({
    data: { orderId, actorId, action, reason },
  });
}

async function getDisputeView({ orderId, adminId }) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw notFound("order not found");

  const evidence = await prisma.disputeEvidence.findMany({
    where: { orderId },
    orderBy: { submittedAt: "asc" },
  });

  await recordAudit({
    orderId,
    actorId: adminId,
    action: "EVIDENCE_VIEWED",
    reason: null,
  });

  return { order, evidence };
}

/**
 * `version` is the optimistic-lock value the caller last saw — a mismatch
 * means the hold state changed since (e.g. someone already released it, or
 * a concurrent CS decision moved it), so the write is rejected instead of
 * silently clobbering whatever happened in between.
 */
async function holdSimulatedFunds({ orderId, reason, version, adminId }) {
  if (!reason) throw badRequest("reason is required");
  if (typeof version !== "number") throw badRequest("version is required");

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw notFound("order not found");
  if (order.paymentSimulationStatus !== "RELEASE_PENDING") {
    throw conflict("order funds are already on hold");
  }
  if (order.version !== version) {
    throw conflict("order dispute state was modified — reload and retry");
  }

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: {
      paymentSimulationStatus: "ON_HOLD",
      version: { increment: 1 },
      holdReason: reason,
      heldAt: new Date(),
      heldBy: adminId,
      preDisputeStatus: order.status,
      status: "disputed",
    },
  });

  await recordAudit({ orderId, actorId: adminId, action: "HOLD", reason });

  return updated;
}

async function releaseSimulatedFunds({ orderId, reason, version, adminId }) {
  if (!reason) throw badRequest("reason is required");
  if (typeof version !== "number") throw badRequest("version is required");

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw notFound("order not found");
  if (order.paymentSimulationStatus !== "ON_HOLD") {
    throw conflict("order funds are not currently on hold");
  }
  if (order.version !== version) {
    throw conflict("order dispute state was modified — reload and retry");
  }

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: {
      paymentSimulationStatus: "RELEASE_PENDING",
      version: { increment: 1 },
      holdReason: null,
      heldAt: null,
      heldBy: null,
      preDisputeStatus: null,
      status: order.preDisputeStatus || order.status,
    },
  });

  await recordAudit({ orderId, actorId: adminId, action: "RELEASE", reason });

  return updated;
}

module.exports = { getDisputeView, holdSimulatedFunds, releaseSimulatedFunds };
