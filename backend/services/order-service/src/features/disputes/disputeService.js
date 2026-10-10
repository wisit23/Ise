const { badRequest, forbidden, notFound, conflict } = require("@reloop/shared");
const orderModel = require("../../models/orderModel");
const disputeModel = require("./disputeModel");
const authClient = require("../../services/authClient");
const { absolutePath } = require("./evidenceStorage");

const AGENT_ROLES = new Set(["CUSTOMER_SERVICE", "ADMIN", "TRUST_AND_SAFETY"]);
const DECISIONS = ["APPROVE_REFUND", "REJECT"];

function normalizedRoles(role, roles) {
  return [
    ...new Set([role, ...(Array.isArray(roles) ? roles : [])].filter(Boolean)),
  ];
}

function hasRole(role, roles, expected) {
  return normalizedRoles(role, roles).includes(expected);
}

function isAgent(role, roles) {
  return normalizedRoles(role, roles).some((candidate) =>
    AGENT_ROLES.has(candidate),
  );
}

function actingAgentRole(role, roles, requiredRole) {
  if (requiredRole && hasRole(role, roles, requiredRole)) return requiredRole;
  if (AGENT_ROLES.has(role)) return role;
  if (hasRole(role, roles, "CUSTOMER_SERVICE")) return "CUSTOMER_SERVICE";
  if (hasRole(role, roles, "TRUST_AND_SAFETY")) return "TRUST_AND_SAFETY";
  return null;
}

async function assertAccess({ dispute, userId, role, roles }) {
  if (isAgent(role, roles)) return dispute;
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
  const existingDispute = await disputeModel.findByOrderId(orderId);
  if (existingDispute) {
    throw badRequest(
      "a dispute can only be opened on a completed order (already-disputed orders can't be reopened)",
    );
  }

  const isCompleted =
    order.status === "completed" ||
    (order.status === "disputed" && order.preDisputeStatus === "completed");
  if (!isCompleted) {
    throw badRequest(
      "a dispute can only be opened on a completed order (already-disputed orders can't be reopened)",
    );
  }

  try {
    return await disputeModel.openDispute({
      orderId,
      openedBy: userId,
      reason: reason.trim(),
      expectedVersion: order.version,
    });
  } catch (err) {
    if (err.code === "P2002")
      throw conflict("this order already has an open dispute");
    throw err;
  }
}

async function getById({ disputeId, userId, role, roles }) {
  const dispute = await disputeModel.findById(disputeId);
  if (!dispute) throw notFound("dispute not found");
  return assertAccess({ dispute, userId, role, roles });
}

/** Convenience lookup for the frontend: a CSS-002 order-search result only
 * has the order id, so the case detail page needs to resolve that to its
 * dispute without knowing the dispute's own id up front. */
async function getByOrderId({ orderId, userId, role, roles }) {
  const dispute = await disputeModel.findByOrderId(orderId);
  if (!dispute) throw notFound("this order has no dispute");
  return assertAccess({ dispute, userId, role, roles });
}

async function listQueue({ role, roles, status, search, skip, take }) {
  if (!isAgent(role, roles)) {
    throw forbidden("only support agents can view the dispute queue");
  }
  return disputeModel.listQueue({ status, search, skip, take });
}

async function addEvidence({ disputeId, userId, role, roles, file }) {
  if (!file) throw badRequest("a file is required");
  const dispute = await disputeModel.findById(disputeId);
  if (!dispute) throw notFound("dispute not found");
  await assertAccess({ dispute, userId, role, roles });

  if (dispute.status === "DECIDED") {
    throw badRequest("cannot add evidence to a decided dispute");
  }

  // If a support agent uploads evidence:
  if (isAgent(role, roles)) {
    if (
      dispute.assignedRole === "TRUST_AND_SAFETY" &&
      !hasRole(role, roles, "TRUST_AND_SAFETY")
    ) {
      throw forbidden(
        "only Trust & Safety staff can add evidence to this escalated dispute",
      );
    }
    if (!dispute.assignedTo) {
      throw forbidden("dispute must be claimed before adding evidence");
    }
    if (dispute.assignedTo !== userId) {
      throw forbidden(
        `only the assigned agent (${dispute.assignedTo}) can add evidence to this dispute`,
      );
    }
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
async function viewEvidence({ disputeId, evidenceId, userId, role, roles }) {
  const dispute = await disputeModel.findById(disputeId);
  if (!dispute) throw notFound("dispute not found");
  await assertAccess({ dispute, userId, role, roles });

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

/** TSR-02 / ADM-DEC-025: Claim an unassigned dispute */
async function claim({ disputeId, userId, role, roles, version }) {
  if (!isAgent(role, roles)) {
    throw forbidden("only support agents can claim a dispute");
  }
  if (typeof version !== "number") {
    throw badRequest("version is required and must be a number");
  }

  const dispute = await disputeModel.findById(disputeId);
  if (!dispute) throw notFound("dispute not found");

  if (dispute.status === "DECIDED") {
    throw badRequest("cannot claim a decided dispute");
  }
  if (dispute.assignedTo) {
    throw conflict(`dispute is already claimed by ${dispute.assignedTo}`);
  }
  if (
    dispute.assignedRole === "TRUST_AND_SAFETY" &&
    !hasRole(role, roles, "TRUST_AND_SAFETY")
  ) {
    throw forbidden(
      "only Trust & Safety staff can claim this escalated dispute",
    );
  }
  if (dispute.version !== version) {
    throw conflict("dispute state was modified — reload and retry");
  }

  const resolvedRole = actingAgentRole(role, roles, dispute.assignedRole);
  const updated = await disputeModel.claim({
    id: disputeId,
    version: dispute.version,
    userId,
    role: resolvedRole,
  });
  if (!updated) {
    throw conflict("dispute claim conflict — reload and retry");
  }
  return updated;
}

/** TSR-02 / ADM-DEC-025: Reassign dispute to another staff */
async function reassign({
  disputeId,
  userId,
  role,
  roles,
  toUserId,
  reason,
  version,
}) {
  if (!isAgent(role, roles)) {
    throw forbidden("only support agents can reassign a dispute");
  }
  if (typeof version !== "number") {
    throw badRequest("version is required and must be a number");
  }
  if (!toUserId?.trim()) throw badRequest("toUserId is required");
  if (!reason?.trim()) throw badRequest("reason is required");

  const dispute = await disputeModel.findById(disputeId);
  if (!dispute) throw notFound("dispute not found");

  if (dispute.status === "DECIDED") {
    throw badRequest("cannot reassign a decided dispute");
  }

  const isCurrentAssignee = dispute.assignedTo === userId;
  const isTrustAndSafety = hasRole(role, roles, "TRUST_AND_SAFETY");
  if (!isCurrentAssignee && !isTrustAndSafety) {
    throw forbidden(
      "only the currently assigned agent or Trust & Safety can reassign this dispute",
    );
  }

  if (dispute.assignedRole === "TRUST_AND_SAFETY" && !isTrustAndSafety) {
    throw forbidden(
      "only Trust & Safety staff can reassign this escalated dispute",
    );
  }

  if (dispute.version !== version) {
    throw conflict("dispute state was modified — reload and retry");
  }

  const targetUser = await authClient.getUser(toUserId.trim());
  if (!targetUser) throw badRequest("target user not found");
  if (targetUser.status !== "ACTIVE") {
    throw badRequest("target user account is not active");
  }

  const targetRoles = targetUser.roles || [targetUser.role];
  const isTargetTS = targetRoles.includes("TRUST_AND_SAFETY");
  const isTargetCS = targetRoles.includes("CUSTOMER_SERVICE");
  if (!isTargetTS && !isTargetCS) {
    throw badRequest("target user is not authorized to handle disputes");
  }

  const targetRole =
    dispute.assignedRole === "TRUST_AND_SAFETY"
      ? "TRUST_AND_SAFETY"
      : isTargetCS
        ? "CUSTOMER_SERVICE"
        : "TRUST_AND_SAFETY";

  if (dispute.assignedRole === "TRUST_AND_SAFETY" && !isTargetTS) {
    throw forbidden(
      "only Trust & Safety staff can be assigned to this escalated dispute",
    );
  }

  const updated = await disputeModel.reassign({
    id: disputeId,
    version: dispute.version,
    actorId: userId,
    toUserId: targetUser.id,
    toRole: targetRole,
    reason: reason.trim(),
  });
  if (!updated) {
    throw conflict("dispute reassign conflict — reload and retry");
  }
  return updated;
}

/** TSR-02 / ADM-DEC-025: Escalate dispute to Trust & Safety */
async function escalate({
  disputeId,
  userId,
  role,
  roles,
  reason,
  version,
  toUserId,
}) {
  if (!isAgent(role, roles)) {
    throw forbidden("only support agents can escalate a dispute");
  }
  if (typeof version !== "number") {
    throw badRequest("version is required and must be a number");
  }
  if (!reason?.trim()) throw badRequest("reason is required");

  const dispute = await disputeModel.findById(disputeId);
  if (!dispute) throw notFound("dispute not found");

  if (dispute.status === "DECIDED") {
    throw badRequest("cannot escalate a decided dispute");
  }

  const isCurrentAssignee = dispute.assignedTo === userId;
  const isTrustAndSafety = hasRole(role, roles, "TRUST_AND_SAFETY");
  if (!isCurrentAssignee && !isTrustAndSafety) {
    throw forbidden(
      "only the currently assigned agent or Trust & Safety can escalate this dispute",
    );
  }

  if (dispute.version !== version) {
    throw conflict("dispute state was modified — reload and retry");
  }

  let verifiedToUserId = null;
  if (toUserId?.trim()) {
    const targetUser = await authClient.getUser(toUserId.trim());
    if (!targetUser) throw badRequest("target user not found");
    if (targetUser.status !== "ACTIVE") {
      throw badRequest("target user account is not active");
    }
    const targetRoles = targetUser.roles || [targetUser.role];
    if (!targetRoles.includes("TRUST_AND_SAFETY")) {
      throw badRequest("target user must be Trust & Safety staff");
    }
    verifiedToUserId = targetUser.id;
  }

  const updated = await disputeModel.escalate({
    id: disputeId,
    version: dispute.version,
    actorId: userId,
    toUserId: verifiedToUserId,
    reason: reason.trim(),
  });
  if (!updated) {
    throw conflict("dispute escalation conflict — reload and retry");
  }
  return updated;
}

/** WF-08 step 7-8: one-way audited decision. */
async function decide({
  disputeId,
  userId,
  role,
  roles,
  decision,
  reason,
  version,
}) {
  if (!isAgent(role, roles))
    throw forbidden("only support agents can decide a dispute");
  if (typeof version !== "number") {
    throw badRequest("version is required and must be a number");
  }
  if (!DECISIONS.includes(decision)) {
    throw badRequest(`decision must be one of ${DECISIONS.join(", ")}`);
  }
  if (!reason?.trim()) throw badRequest("reason is required");

  const dispute = await disputeModel.findById(disputeId);
  if (!dispute) throw notFound("dispute not found");

  // TSR-02 / ADM-DEC-025: Escalated dispute can only be decided by Trust & Safety
  if (
    dispute.assignedRole === "TRUST_AND_SAFETY" &&
    !hasRole(role, roles, "TRUST_AND_SAFETY")
  ) {
    throw forbidden(
      "only Trust & Safety staff can decide this escalated dispute",
    );
  }

  // Must be claimed by current user before deciding
  if (!dispute.assignedTo) {
    throw forbidden("dispute must be claimed before a decision can be made");
  }
  if (dispute.assignedTo !== userId) {
    throw forbidden(
      `only the assigned agent (${dispute.assignedTo}) can decide this dispute`,
    );
  }

  if (dispute.version !== version) {
    throw conflict("dispute state was modified — reload and retry");
  }

  const order = await orderModel.findById(dispute.orderId);
  if (!order) throw notFound("order not found");

  const updated = await disputeModel.decide({
    id: disputeId,
    version: dispute.version,
    expectedOrderVersion: order.version,
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
  claim,
  reassign,
  escalate,
  decide,
  listQueue,
};
