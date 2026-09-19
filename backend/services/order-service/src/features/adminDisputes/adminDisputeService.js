const { badRequest, conflict, notFound } = require("@reloop/shared");
const prisma = require("../../models/prismaClient");
const orderTransitionService = require("../../services/orderTransitionService");

/** Append-only — never updated or deleted (ADM-DEC-003: evidence must persist). */
async function recordAudit({ orderId, actorId, action, reason }) {
  return prisma.disputeAudit.create({
    data: { orderId, actorId, action, reason },
  });
}

async function getDisputeView({ orderId, adminId, staffId }) {
  const actorId = staffId || adminId;
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    // The CS-owned case (if a buyer opened one) is the context Admin needs
    // before holding or releasing funds — without it Admin would be deciding
    // blind about a case another team is actively working.
    include: { dispute: true },
  });
  if (!order) throw notFound("order not found");

  const evidence = await prisma.adminDisputeEvidence.findMany({
    where: { orderId },
    orderBy: { submittedAt: "asc" },
  });

  await recordAudit({
    orderId,
    actorId,
    action: "EVIDENCE_VIEWED",
    reason: null,
  });

  return { order, evidence, disputeCase: order.dispute || null };
}

const ALLOWED_HOLD_STATUSES = [
  "confirmed",
  "shipped",
  "completed",
  "disputed",
];

/**
 * `version` is the optimistic-lock value the caller last saw — a mismatch
 * means the hold state changed since (e.g. someone already released it, or
 * a concurrent CS decision moved it), so the write is rejected instead of
 * silently clobbering whatever happened in between.
 */
async function holdSimulatedFunds({
  orderId,
  reason,
  version,
  adminId,
  staffId,
}) {
  const actorId = staffId || adminId;
  const trimmedReason = reason?.trim();
  if (!trimmedReason) throw badRequest("reason is required");
  if (typeof version !== "number") throw badRequest("version is required");

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw notFound("order not found");
  if (!ALLOWED_HOLD_STATUSES.includes(order.status)) {
    throw badRequest(`order status '${order.status}' cannot be placed on hold`);
  }
  if (order.paymentSimulationStatus !== "RELEASE_PENDING") {
    throw conflict("order funds are already on hold");
  }
  if (order.version !== version) {
    throw conflict("order dispute state was modified — reload and retry");
  }

  const [updated] = await prisma.$transaction(async (tx) => {
    await orderTransitionService.addHold(tx, {
      orderId,
      source: "TRUST_AND_SAFETY",
      referenceId: "admin-hold",
      reason: trimmedReason,
      heldBy: actorId,
    });

    const preDispute =
      order.preDisputeStatus && order.preDisputeStatus !== "disputed"
        ? order.preDisputeStatus
        : order.status === "disputed"
          ? "completed"
          : order.status;

    const { count } = await tx.order.updateMany({
      where: {
        id: orderId,
        version,
        paymentSimulationStatus: "RELEASE_PENDING",
        status: { in: ALLOWED_HOLD_STATUSES },
      },
      data: {
        paymentSimulationStatus: "ON_HOLD",
        version: { increment: 1 },
        holdReason: trimmedReason,
        heldAt: new Date(),
        heldBy: actorId,
        preDisputeStatus: preDispute,
        status: "disputed",
        payoutHeld: true,
        disputedAt: order.disputedAt || new Date(),
      },
    });
    if (count === 0) {
      throw conflict("order state was modified concurrently — reload and retry");
    }

    const orderUpdated = await tx.order.findUnique({ where: { id: orderId } });

    await tx.disputeAudit.create({
      data: {
        orderId,
        actorId,
        action: "HOLD",
        reason: trimmedReason,
      },
    });

    return [orderUpdated];
  });

  return updated;
}

async function releaseSimulatedFunds({
  orderId,
  reason,
  version,
  adminId,
  staffId,
}) {
  const actorId = staffId || adminId;
  const trimmedReason = reason?.trim();
  if (!trimmedReason) throw badRequest("reason is required");
  if (typeof version !== "number") throw badRequest("version is required");

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { dispute: true },
  });
  if (!order) throw notFound("order not found");
  if (order.paymentSimulationStatus !== "ON_HOLD") {
    throw conflict("order funds are not currently on hold");
  }
  if (order.version !== version) {
    throw conflict("order dispute state was modified — reload and retry");
  }

  const [updated] = await prisma.$transaction(async (tx) => {
    // Release only this specific administrative hold
    await orderTransitionService.releaseHold(tx, {
      orderId,
      source: "TRUST_AND_SAFETY",
      referenceId: "admin-hold",
      reason: trimmedReason,
      releasedBy: actorId,
    });

    // Recalculate hold state from all remaining active holds (including dispute, account sanction, etc.)
    const holdState = await orderTransitionService.resolveHoldState(tx, orderId, {
      releasingTsHold: true,
    });

    const { count } = await tx.order.updateMany({
      where: {
        id: orderId,
        version,
        paymentSimulationStatus: "ON_HOLD",
      },
      data: {
        paymentSimulationStatus: "RELEASE_PENDING",
        version: { increment: 1 },
        holdReason: null,
        heldAt: null,
        heldBy: null,
        preDisputeStatus:
          holdState.nextStatus === "disputed"
            ? order.preDisputeStatus && order.preDisputeStatus !== "disputed"
              ? order.preDisputeStatus
              : "completed"
            : null,
        status: holdState.nextStatus,
        payoutHeld: holdState.isPayoutHeld,
      },
    });
    if (count === 0) {
      throw conflict("order state was modified concurrently — reload and retry");
    }

    const orderUpdated = await tx.order.findUnique({ where: { id: orderId } });

    await tx.disputeAudit.create({
      data: {
        orderId,
        actorId,
        action: "RELEASE",
        reason: trimmedReason,
      },
    });

    return [orderUpdated];
  });

  return updated;
}

module.exports = { getDisputeView, holdSimulatedFunds, releaseSimulatedFunds };
