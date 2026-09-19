const { conflict } = require("@reloop/shared");

/**
 * Central transition and hold service for order-service (TSR-02 / ADM-DEC-025).
 * Decouples case ownership from active hold sources and ensures atomic status & payout-hold calculations.
 */

async function addHold(tx, { orderId, source, referenceId, reason, heldBy }) {
  const hold = await tx.orderHold.create({
    data: {
      orderId,
      source,
      referenceId: referenceId || null,
      reason: reason || "Hold placed",
      heldBy: heldBy || "system",
      heldAt: new Date(),
    },
  });

  return hold;
}

async function releaseHold(tx, { orderId, source, referenceId, reason, releasedBy }) {
  const where = {
    orderId,
    source,
    releasedAt: null,
  };
  if (referenceId) {
    where.referenceId = referenceId;
  }

  const { count } = await tx.orderHold.updateMany({
    where,
    data: {
      releasedAt: new Date(),
      releasedBy: releasedBy || "system",
      releaseReason: reason || "Hold released",
    },
  });

  return count;
}

async function hasActiveHolds(tx, orderId) {
  const activeCount = await tx.orderHold.count({
    where: {
      orderId,
      releasedAt: null,
    },
  });
  return activeCount > 0;
}

/**
 * Calculates whether payout should be held and what the order status should be
 * after a hold release.
 */
async function resolveHoldState(tx, orderId, { releasingTsHold = false } = {}) {
  const [order, activeHoldCount] = await Promise.all([
    tx.order.findUnique({
      where: { id: orderId },
      include: { dispute: true },
    }),
    tx.orderHold.count({
      where: { orderId, releasedAt: null },
    }),
  ]);

  if (!order) return null;

  const csCaseStillOpen = Boolean(order.dispute && order.dispute.status !== "DECIDED");
  const tsHoldStillOpen = !releasingTsHold && order.paymentSimulationStatus === "ON_HOLD";

  // payoutHeld is true if any active OrderHold exists OR legacy flags are still holding
  const isPayoutHeld = activeHoldCount > 0 || csCaseStillOpen || tsHoldStillOpen;

  let nextStatus = order.status;
  if (csCaseStillOpen || tsHoldStillOpen || activeHoldCount > 0) {
    nextStatus = "disputed";
  } else if (order.dispute?.decision === "APPROVE_REFUND") {
    // If dispute was approved for refund, never return to preDisputeStatus
    nextStatus = "refunded";
  } else if (order.status === "disputed") {
    // No active holds remain and not refunded: restore preDisputeStatus
    nextStatus =
      order.preDisputeStatus && order.preDisputeStatus !== "disputed"
        ? order.preDisputeStatus
        : "completed";
  }

  return {
    isPayoutHeld,
    nextStatus,
    activeHoldCount,
  };
}

/**
 * Validates that an order can be updated by buyer/seller.
 * Fails if order is currently disputed or under active hold.
 */
function assertCanParticipantUpdateStatus(order) {
  if (order.status === "disputed") {
    throw conflict("cannot update status while order has an open dispute");
  }
  if (order.payoutHeld) {
    throw conflict("cannot update status while order payout is on hold");
  }
  if (order.paymentSimulationStatus === "ON_HOLD") {
    throw conflict("cannot update status while order funds are on hold");
  }
}

module.exports = {
  addHold,
  releaseHold,
  hasActiveHolds,
  resolveHoldState,
  assertCanParticipantUpdateStatus,
};
