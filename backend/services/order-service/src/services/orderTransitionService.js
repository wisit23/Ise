const { badRequest, conflict, notFound } = require("@reloop/shared");
async function addHold(
  tx,
  { orderId, source, referenceId, reason, heldBy, holdBy },
) {
  if (!source || !referenceId)
    throw badRequest("hold source and referenceId are required");
  const payment = await tx.payment.findFirst({
    where: { orderId, paymentStatus: "paid" },
    orderBy: { createdAt: "desc" },
  });
  if (!payment) throw conflict("a hold requires a successful payment");
  const existing = await tx.hold.findFirst({
    where: { paymentId: payment.id, source, referenceId, releaseAt: null },
  });
  if (existing) return existing;
  return tx.hold.create({
    data: {
      paymentId: payment.id,
      source,
      referenceId,
      holdReason: reason,
      holdStatus: "ON_HOLD",
      holdAmount: payment.paymentAmount,
      holdBy: holdBy || heldBy,
      holdAt: new Date(),
    },
  });
}
async function releaseHold(tx, { orderId, source, referenceId, releasedBy }) {
  if (!source || !referenceId)
    throw badRequest("hold source and referenceId are required");
  const holds = await tx.hold.findMany({
    where: { payment: { orderId }, source, referenceId, releaseAt: null },
  });
  let count = 0;
  for (const hold of holds) {
    const changed = await tx.hold.updateMany({
      where: { id: hold.id, releaseAt: null },
      data: {
        holdStatus: "RELEASED",
        releaseAmount: hold.holdAmount,
        releaseAt: new Date(),
        releasedBy,
      },
    });
    count += changed.count;
  }
  return count;
}
async function hasActiveHolds(tx, orderId) {
  return (
    (await tx.hold.count({
      where: { payment: { orderId }, releaseAt: null },
    })) > 0
  );
}
async function resolveHoldState(tx, orderId) {
  const [order, activeHoldCount] = await Promise.all([
    tx.order.findUnique({ where: { id: orderId }, include: { dispute: true } }),
    tx.hold.count({ where: { payment: { orderId }, releaseAt: null } }),
  ]);
  if (!order) throw notFound("order not found");
  const openCase = Boolean(order.dispute && !order.dispute.decision);
  const isPayoutHeld = activeHoldCount > 0 || openCase;
  let nextStatus = order.status;
  if (isPayoutHeld) nextStatus = "disputed";
  else if (order.dispute?.decision === "APPROVE_REFUND")
    nextStatus = "refunded";
  else if (order.status === "disputed")
    nextStatus =
      order.preDisputeStatus && order.preDisputeStatus !== "disputed"
        ? order.preDisputeStatus
        : "completed";
  return { isPayoutHeld, nextStatus, activeHoldCount };
}
function assertCanCancelOrder(order) {
  const paid =
    order.payments?.some((payment) => payment.paymentStatus === "paid") ||
    ["processing", "paid"].includes(order.checkout?.status);
  if (paid || !["pending", "pending_payment"].includes(order.status)) {
    throw conflict(
      "ไม่สามารถยกเลิกคำสั่งซื้อที่ชำระเงินแล้ว กรุณาดำเนินการผ่านกระบวนการข้อพิพาท",
    );
  }
}
function assertCanParticipantUpdateStatus(order) {
  if (order.status === "disputed")
    throw conflict("cannot update status while order has an open dispute");
  if (order.payoutHeld || order.paymentSimulationStatus === "ON_HOLD")
    throw conflict("cannot update status while order payout is on hold");
}
module.exports = {
  addHold,
  releaseHold,
  hasActiveHolds,
  resolveHoldState,
  assertCanParticipantUpdateStatus,
  assertCanCancelOrder,
};
