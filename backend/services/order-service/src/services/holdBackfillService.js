const prisma = require("../models/prismaClient");

/**
 * TSR-02 Backfill & Validation Service:
 * 1. Synchronizes legacy `payoutHeld`, `paymentSimulationStatus`, and `dispute` states to `OrderHold` records.
 * 2. Identifies and reports ambiguous/conflicting order states for manual audit (prevents automatic unsafe unholding).
 */
async function backfillAndValidateHolds({ dryRun = false, db = prisma } = {}) {
  const orders = await db.order.findMany({
    where: {
      OR: [
        { payoutHeld: true },
        { paymentSimulationStatus: "ON_HOLD" },
        { dispute: { isNot: null } },
        { status: "disputed" },
      ],
    },
    include: {
      dispute: true,
    },
  });

  const createdHolds = [];
  const ambiguousOrders = [];

  for (const order of orders) {
    const existingHolds = await db.orderHold.findMany({
      where: { orderId: order.id },
    });
    const activeHolds = existingHolds.filter((h) => !h.releasedAt);

    // 1. Dispute hold backfill
    if (
      order.dispute &&
      ["OPEN", "NEEDS_INFO"].includes(order.dispute.status)
    ) {
      const hasDisputeHold = activeHolds.some(
        (h) =>
          h.source === "DISPUTE" &&
          (h.referenceId === order.dispute.id || !h.referenceId),
      );
      if (!hasDisputeHold) {
        createdHolds.push({
          orderId: order.id,
          source: "DISPUTE",
          referenceId: order.dispute.id,
          dedupeKey: `BACKFILL:DISPUTE:${order.dispute.id}`,
          reason: order.dispute.reason || "Backfilled dispute hold",
          heldBy: order.dispute.openedBy || "system",
          heldAt: order.dispute.createdAt || new Date(),
        });
      }
    }

    // 2. Trust & Safety admin hold backfill
    if (order.paymentSimulationStatus === "ON_HOLD") {
      const hasTsHold = activeHolds.some(
        (h) =>
          h.source === "TRUST_AND_SAFETY" &&
          (h.referenceId === "admin-hold" || !h.referenceId),
      );
      if (!hasTsHold) {
        createdHolds.push({
          orderId: order.id,
          source: "TRUST_AND_SAFETY",
          referenceId: "admin-hold",
          dedupeKey: `BACKFILL:TRUST_AND_SAFETY:${order.id}`,
          reason: order.holdReason || "Backfilled administrative hold",
          heldBy: order.heldBy || "admin",
          heldAt: order.heldAt || new Date(),
        });
      }
    }

    // 3. Ambiguity & Anomaly Detection (TSR-02 line 89)
    const hasOpenDispute =
      order.dispute && ["OPEN", "NEEDS_INFO"].includes(order.dispute.status);
    const isTsHeld = order.paymentSimulationStatus === "ON_HOLD";

    // Anomaly A: payoutHeld is true, but no dispute is open, no paymentSimulationStatus=ON_HOLD, and no active holds
    if (
      order.payoutHeld &&
      !hasOpenDispute &&
      !isTsHeld &&
      activeHolds.length === 0
    ) {
      ambiguousOrders.push({
        orderId: order.id,
        issue: "PAYOUT_HELD_WITHOUT_ACTIVE_SOURCE",
        details:
          "Order has payoutHeld=true but no open dispute, no ON_HOLD status, and no active hold records",
        status: order.status,
        payoutHeld: order.payoutHeld,
      });
    }

    // Anomaly B: Refund was approved, but status was reverted or is not refunded
    if (
      order.dispute?.decision === "APPROVE_REFUND" &&
      order.status !== "refunded"
    ) {
      ambiguousOrders.push({
        orderId: order.id,
        issue: "REFUND_DECIDED_BUT_STATUS_NOT_REFUNDED",
        details: `Dispute approved refund, but order status is ${order.status}`,
        status: order.status,
        payoutHeld: order.payoutHeld,
      });
    }

    // Anomaly C: Status is "disputed", but no dispute exists and no admin hold exists
    if (
      order.status === "disputed" &&
      !order.dispute &&
      !isTsHeld &&
      activeHolds.length === 0
    ) {
      ambiguousOrders.push({
        orderId: order.id,
        issue: "DISPUTED_STATUS_WITHOUT_DISPUTE_OR_HOLD",
        details:
          "Order has status='disputed' without associated dispute or active hold",
        status: order.status,
        payoutHeld: order.payoutHeld,
      });
    }

    // Anomaly D: paymentSimulationStatus is ON_HOLD, but payoutHeld is false
    if (isTsHeld && !order.payoutHeld) {
      ambiguousOrders.push({
        orderId: order.id,
        issue: "SIMULATION_ON_HOLD_BUT_PAYOUT_NOT_HELD",
        details: "Payment simulation is ON_HOLD but payoutHeld is false",
        status: order.status,
        payoutHeld: order.payoutHeld,
      });
    }

    // Anomaly E: Open dispute exists, but payoutHeld is false
    if (hasOpenDispute && !order.payoutHeld) {
      ambiguousOrders.push({
        orderId: order.id,
        issue: "OPEN_DISPUTE_BUT_PAYOUT_NOT_HELD",
        details: "Dispute is open/needs_info but order.payoutHeld is false",
        status: order.status,
        payoutHeld: order.payoutHeld,
      });
    }

    // Anomaly F: Open dispute exists, but order.status is not disputed
    if (hasOpenDispute && order.status !== "disputed") {
      ambiguousOrders.push({
        orderId: order.id,
        issue: "OPEN_DISPUTE_BUT_STATUS_NOT_DISPUTED",
        details: `Dispute is open/needs_info but order.status is '${order.status}'`,
        status: order.status,
        payoutHeld: order.payoutHeld,
      });
    }
  }

  let insertedHoldsCount = 0;
  let updatedOrdersCount = 0;

  if (!dryRun) {
    for (const scannedOrder of orders) {
      const result = await db.$transaction(async (tx) => {
        // Re-read inside the transaction: the initial scan is diagnostic only
        // and must never be used to overwrite a newer decision.
        const current = await tx.order.findUnique({
          where: { id: scannedOrder.id },
          include: {
            dispute: true,
            holds: { where: { releasedAt: null } },
          },
        });
        if (!current) return { holds: 0, orders: 0 };

        const openDispute =
          current.dispute &&
          ["OPEN", "NEEDS_INFO"].includes(current.dispute.status);
        const missingHolds = [];

        if (
          openDispute &&
          !current.holds.some(
            (hold) =>
              hold.source === "DISPUTE" &&
              (hold.referenceId === current.dispute.id || !hold.referenceId),
          )
        ) {
          missingHolds.push({
            orderId: current.id,
            source: "DISPUTE",
            referenceId: current.dispute.id,
            dedupeKey: `BACKFILL:DISPUTE:${current.dispute.id}`,
            reason: current.dispute.reason || "Backfilled dispute hold",
            heldBy: current.dispute.openedBy || "system",
            heldAt: current.dispute.createdAt || new Date(),
          });
        }

        if (
          current.paymentSimulationStatus === "ON_HOLD" &&
          !current.holds.some(
            (hold) =>
              hold.source === "TRUST_AND_SAFETY" &&
              (hold.referenceId === "admin-hold" || !hold.referenceId),
          )
        ) {
          missingHolds.push({
            orderId: current.id,
            source: "TRUST_AND_SAFETY",
            referenceId: "admin-hold",
            dedupeKey: `BACKFILL:TRUST_AND_SAFETY:${current.id}`,
            reason: current.holdReason || "Backfilled administrative hold",
            heldBy: current.heldBy || "admin",
            heldAt: current.heldAt || new Date(),
          });
        }

        let holds = 0;
        if (missingHolds.length > 0) {
          const created = await tx.orderHold.createMany({
            data: missingHolds,
            skipDuplicates: true,
          });
          holds = created.count;
        }

        let healedOrders = 0;
        if (
          openDispute &&
          (!current.payoutHeld || current.status !== "disputed")
        ) {
          const data = {
            payoutHeld: true,
            status: "disputed",
            version: { increment: 1 },
          };
          if (
            current.status !== "disputed" &&
            (!current.preDisputeStatus ||
              current.preDisputeStatus === "disputed")
          ) {
            data.preDisputeStatus = current.status;
          }

          const healed = await tx.order.updateMany({
            where: {
              id: current.id,
              version: current.version,
              status: current.status,
              dispute: { is: { status: { in: ["OPEN", "NEEDS_INFO"] } } },
            },
            data,
          });
          if (healed.count === 0) {
            throw new Error(
              `order ${current.id} changed during hold backfill; rerun the backfill`,
            );
          }
          healedOrders = 1;
        }

        return { holds, orders: healedOrders };
      });
      insertedHoldsCount += result.holds;
      updatedOrdersCount += result.orders;
    }
  }

  return {
    scannedOrdersCount: orders.length,
    createdHoldsCount: dryRun ? createdHolds.length : insertedHoldsCount,
    updatedOrdersCount,
    createdHolds: dryRun ? createdHolds : undefined,
    ambiguousOrdersCount: ambiguousOrders.length,
    ambiguousOrders,
  };
}

module.exports = {
  backfillAndValidateHolds,
};
