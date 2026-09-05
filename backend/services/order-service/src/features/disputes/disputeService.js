const { badRequest, forbidden, notFound, conflict } = require("@reloop/shared");
const orderModel = require("../../models/orderModel");
const disputeModel = require("./disputeModel");
const { absolutePath } = require("./evidenceStorage");

const AGENT_ROLES = new Set(["CUSTOMER_SERVICE", "ADMIN"]);
const DECISIONS = ["APPROVE_REFUND", "REJECT"];

function isAgent(role) {
  return AGENT_ROLES.has(role);
}

async function assertAccess({ dispute, userId, role }) {
  if (isAgent(role)) return dispute;
  const order = await orderModel.findById(dispute.orderId);
  if (order.buyerId === userId || order.sellerId === userId) return dispute;
  throw forbidden("you do not have access to this dispute");
}

/** WF-08 step 1-2: buyer opens a dispute on a completed order. */
async function open({ orderId, userId, reason }) {
  if (!reason?.trim()) throw badRequest("reason is required");

  const order = await orderModel.findById(orderId);
  if (!order) throw notFound("order not found");
  if (order.buyerId !== userId) {
    throw forbidden("only the buyer of this order can open a dispute");
  }
  if (order.status !== "completed") {
    throw badRequest(
      "a dispute can only be opened on a completed order (already-disputed orders can't be reopened)",
    );
  }

  try {
    return await disputeModel.openDispute({
      orderId,
      openedBy: userId,
      reason: reason.trim(),
    });
  } catch (err) {
    if (err.code === "P2002")
      throw conflict("this order already has an open dispute");
    throw err;
  }
}

async function getById({ disputeId, userId, role }) {
  const dispute = await disputeModel.findById(disputeId);
  if (!dispute) throw notFound("dispute not found");
  return assertAccess({ dispute, userId, role });
}

/** Convenience lookup for the frontend: a CSS-002 order-search result only
 * has the order id, so the case detail page needs to resolve that to its
 * dispute without knowing the dispute's own id up front. */
async function getByOrderId({ orderId, userId, role }) {
  const dispute = await disputeModel.findByOrderId(orderId);
  if (!dispute) throw notFound("this order has no dispute");
  return assertAccess({ dispute, userId, role });
}

async function listQueue({ role, status, search, skip, take }) {
  if (!isAgent(role)) {
    throw forbidden("only support agents can view the dispute queue");
  }
  return disputeModel.listQueue({ status, search, skip, take });
}

async function addEvidence({ disputeId, userId, role, file }) {
  if (!file) throw badRequest("a file is required");
  const dispute = await disputeModel.findById(disputeId);
  if (!dispute) throw notFound("dispute not found");
  await assertAccess({ dispute, userId, role });

  if (dispute.status === "DECIDED") {
    throw badRequest("cannot add evidence to a decided dispute");
  }

  return disputeModel.addEvidence({
    disputeId,
    uploaderId: userId,
    storageKey: file.filename,
    fileType: file.mimetype,
  });
}

/** Returns the evidence's absolute file path for the controller to stream,
 * after authorizing and audit-logging the view (NFR-SP-03). */
async function viewEvidence({ disputeId, evidenceId, userId, role }) {
  const dispute = await disputeModel.findById(disputeId);
  if (!dispute) throw notFound("dispute not found");
  await assertAccess({ dispute, userId, role });

  const evidence = await disputeModel.findEvidence(disputeId, evidenceId);
  if (!evidence) throw notFound("evidence not found");

  await disputeModel.auditLog({
    disputeId,
    actorId: userId,
    action: "VIEW_EVIDENCE",
    detail: evidenceId,
  });

  return {
    path: absolutePath(evidence.storageKey),
    fileType: evidence.fileType,
  };
}

/** WF-08 step 7-8: one-way audited decision. */
async function decide({ disputeId, userId, role, decision, reason }) {
  if (!isAgent(role))
    throw forbidden("only support agents can decide a dispute");
  if (!DECISIONS.includes(decision)) {
    throw badRequest(`decision must be one of ${DECISIONS.join(", ")}`);
  }
  if (!reason?.trim()) throw badRequest("reason is required");

  const dispute = await disputeModel.findById(disputeId);
  if (!dispute) throw notFound("dispute not found");

  const updated = await disputeModel.decide({
    id: disputeId,
    version: dispute.version,
    decision,
    decisionReason: reason.trim(),
    decidedBy: userId,
  });
  if (!updated) throw conflict("this dispute already has a decision");
  return updated;
}

module.exports = {
  open,
  getById,
  getByOrderId,
  addEvidence,
  viewEvidence,
  decide,
  listQueue,
};
