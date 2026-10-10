const { badRequest, conflict, notFound } = require("@reloop/shared");
const prisma = require("../../models/prismaClient");
const transitions = require("../../services/orderTransitionService");
const orderModel = require("../../models/orderModel");

async function getDisputeView({ orderId, adminId }) {
  const order = await orderModel.findById(orderId);
  if (!order) throw notFound("order not found");
  const evidence = await prisma.safetyDisputeEvidence.findMany({
    where: { orderId },
    include: { evidence: true },
    orderBy: { verifyAt: "asc" },
  });
  await prisma.orderLog.create({
    data: orderModel.logData(order, adminId, "ADMIN_EVIDENCE_VIEWED", {
      evidenceIds: evidence.map((e) => e.id),
    }),
  });
  return { order, evidence, disputeCase: order.dispute };
}
async function changeHold(
  { orderId, reason, version, adminId, staffId },
  release,
) {
  const actorId = staffId || adminId;
  if (typeof reason !== "string" || !reason.trim())
    throw badRequest("reason is required");
  if (!Number.isInteger(version)) throw badRequest("version is required");
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) throw notFound("order not found");
    if (
      !["confirmed", "shipped", "completed", "disputed"].includes(order.status)
    )
      throw conflict("order cannot be placed on hold");
    const changed = await tx.order.updateMany({
      where: { id: orderId, version },
      data: { version: { increment: 1 } },
    });
    if (changed.count !== 1)
      throw conflict(
        "order state was modified concurrently — reload and retry",
      );
    const existing = await tx.hold.findFirst({
      where: {
        payment: { orderId },
        source: "TRUST_AND_SAFETY",
        referenceId: orderId,
        releaseAt: null,
      },
    });
    if (release) {
      if (!existing)
        throw conflict(
          "order funds are not currently on this administrative hold",
        );
      await transitions.releaseHold(tx, {
        orderId,
        source: "TRUST_AND_SAFETY",
        referenceId: orderId,
        releasedBy: actorId,
      });
    } else {
      if (existing)
        throw conflict("order funds are already on this administrative hold");
      await transitions.addHold(tx, {
        orderId,
        source: "TRUST_AND_SAFETY",
        referenceId: orderId,
        reason: reason.trim(),
        holdBy: actorId,
      });
      if (order.status !== "disputed")
        await tx.order.update({
          where: { id: orderId },
          data: { preDisputeStatus: order.status },
        });
    }
    const state = await transitions.resolveHoldState(tx, orderId);
    await tx.order.update({
      where: { id: orderId },
      data: {
        status: state.nextStatus,
        ...(state.nextStatus !== "disputed" ? { preDisputeStatus: null } : {}),
      },
    });
    await tx.orderLog.create({
      data: orderModel.logData(
        order,
        actorId,
        release ? "HOLD_RELEASED" : "HOLD_PLACED",
        {
          source: "TRUST_AND_SAFETY",
          referenceId: orderId,
          reason: reason.trim(),
        },
      ),
    });
    return orderModel.view(
      await tx.order.findUnique({
        where: { id: orderId },
        include: orderModel.INCLUDE,
      }),
    );
  });
}
function holdSimulatedFunds(input) {
  return changeHold(input, false);
}
function releaseSimulatedFunds(input) {
  return changeHold(input, true);
}
async function verifyEvidence({
  orderId,
  evidenceId,
  actorId,
  status,
  detail,
  version,
}) {
  if (
    typeof status !== "string" ||
    !status.trim() ||
    typeof detail !== "string" ||
    !detail.trim()
  )
    throw badRequest("status and detail are required");
  if (!Number.isInteger(version))
    throw badRequest("evidence version is required");
  return prisma.$transaction(async (tx) => {
    const evidence = await tx.disputeEvidence.findFirst({
      where: { id: evidenceId, dispute: { orderId } },
    });
    if (!evidence) throw notFound("evidence not found for this order");
    const claimed = await tx.disputeEvidence.updateMany({
      where: { id: evidenceId, version },
      data: { version: { increment: 1 } },
    });
    if (claimed.count !== 1)
      throw conflict("evidence changed — reload and retry");
    const data = {
      orderId,
      detail: detail.trim(),
      status: status.trim(),
      verifyBy: actorId,
      verifyAt: new Date(),
    };
    const review = await tx.safetyDisputeEvidence.upsert({
      where: { evidenceId },
      create: { ...data, evidenceId },
      update: data,
    });
    await tx.safetyLog.create({
      data: {
        safetyId: review.id,
        actorId,
        action: "VERIFY",
        detail: detail.trim(),
      },
    });
    await tx.disputeAuditLog.create({
      data: {
        disputeEvidenceId: evidenceId,
        actorId,
        action: "SAFETY_VERIFY",
        detail: detail.trim(),
      },
    });
    return review;
  });
}
module.exports = {
  getDisputeView,
  holdSimulatedFunds,
  releaseSimulatedFunds,
  verifyEvidence,
};
