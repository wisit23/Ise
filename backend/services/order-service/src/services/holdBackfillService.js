const prisma = require("../models/prismaClient");
const transitions = require("./orderTransitionService");
// After the ER migration, payment-linked holds are the source of truth.
// Only a real open case with an actual paid payment can supply a missing hold.
async function backfillAndValidateHolds({ dryRun = false, db = prisma } = {}) {
  const orders = await db.order.findMany({
    where: {
      OR: [
        { dispute: { isNot: null } },
        { status: "disputed" },
        { payments: { some: { holds: { some: { releaseAt: null } } } } },
      ],
    },
    include: { dispute: true, payments: { include: { holds: true } } },
  });
  const ambiguousOrders = [],
    createdHolds = [];
  let createdHoldsCount = 0,
    updatedOrdersCount = 0;
  for (const scanned of orders) {
    const active = scanned.payments
      .flatMap((p) => p.holds)
      .filter((h) => !h.releaseAt);
    const open = scanned.dispute && !scanned.dispute.decision;
    const paid = scanned.payments.some((p) => p.paymentStatus === "paid");
    if (open && !paid)
      ambiguousOrders.push({
        orderId: scanned.id,
        issue: "OPEN_DISPUTE_WITHOUT_PAID_PAYMENT",
      });
    if (scanned.status === "disputed" && !open && !active.length)
      ambiguousOrders.push({
        orderId: scanned.id,
        issue: "DISPUTED_STATUS_WITHOUT_DISPUTE_OR_HOLD",
      });
    if (
      scanned.dispute?.decision === "APPROVE_REFUND" &&
      !active.length &&
      scanned.status !== "refunded"
    )
      ambiguousOrders.push({
        orderId: scanned.id,
        issue: "REFUND_DECIDED_BUT_STATUS_NOT_REFUNDED",
      });
    const missing =
      open &&
      paid &&
      !active.some(
        (h) => h.source === "DISPUTE" && h.referenceId === scanned.dispute.id,
      );
    if (missing)
      createdHolds.push({
        orderId: scanned.id,
        source: "DISPUTE",
        referenceId: scanned.dispute.id,
      });
    if (dryRun || !open || !paid) continue;
    const result = await db.$transaction(async (tx) => {
      const current = await tx.order.findUnique({
        where: { id: scanned.id },
        include: { dispute: true, payments: { include: { holds: true } } },
      });
      if (!current?.dispute || current.dispute.decision)
        return { holds: 0, orders: 0 };
      const hasHold = current.payments
        .flatMap((p) => p.holds)
        .some(
          (h) =>
            h.source === "DISPUTE" &&
            h.referenceId === current.dispute.id &&
            !h.releaseAt,
        );
      if (hasHold && current.status === "disputed")
        return { holds: 0, orders: 0 };
      const changed = await tx.order.updateMany({
        where: {
          id: current.id,
          version: current.version,
          dispute: { is: { decision: null } },
        },
        data: {
          status: "disputed",
          ...(current.status !== "disputed"
            ? { preDisputeStatus: current.status }
            : {}),
          version: { increment: 1 },
        },
      });
      if (!changed.count)
        throw new Error("order changed during hold backfill; retry");
      if (!hasHold)
        await transitions.addHold(tx, {
          orderId: current.id,
          source: "DISPUTE",
          referenceId: current.dispute.id,
          reason: current.dispute.reason,
          holdBy: current.dispute.createdBy,
        });
      await tx.orderLog.create({
        data: require("../models/orderModel").logData(
          current,
          current.dispute.createdBy,
          "HOLD_BACKFILLED",
          { disputeCaseId: current.dispute.id },
        ),
      });
      return {
        holds: hasHold ? 0 : 1,
        orders: current.status === "disputed" ? 0 : 1,
      };
    });
    createdHoldsCount += result.holds;
    updatedOrdersCount += result.orders;
  }
  return {
    scannedOrdersCount: orders.length,
    createdHoldsCount: dryRun ? createdHolds.length : createdHoldsCount,
    updatedOrdersCount,
    createdHolds: dryRun ? createdHolds : undefined,
    ambiguousOrdersCount: ambiguousOrders.length,
    ambiguousOrders,
  };
}
module.exports = { backfillAndValidateHolds };
