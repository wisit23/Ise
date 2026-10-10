const {
  badRequest,
  forbidden,
  notFound,
  conflict,
  AppError,
} = require("@reloop/shared");
const fs = require("fs");
const orderModel = require("../../models/orderModel");
const disputeModel = require("./disputeModel");
const authClient = require("../../services/authClient");
const { absolutePath } = require("./evidenceStorage");
const chatClient = require("../../services/chatClient");

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
  await assertAccess({ dispute, userId, role, roles });
  return withShippingFacts(dispute);
}

/** Convenience lookup for the frontend: a CSS-002 order-search result only
 * has the order id, so the case detail page needs to resolve that to its
 * dispute without knowing the dispute's own id up front. */
async function getByOrderId({ orderId, userId, role, roles }) {
  const dispute = await disputeModel.findByOrderId(orderId);
  if (!dispute) throw notFound("this order has no dispute");
  await assertAccess({ dispute, userId, role, roles });
  return withShippingFacts(dispute);
}

function withShippingFacts(dispute) {
  const order = dispute.order;
  if (!order) return dispute;
  return {
    ...dispute,
    shipping: {
      available: false,
      status: order.status,
      carrier: null,
      trackingNumber: null,
      source: "ORDER",
      updatedAt: order.updatedAt,
      timeline: [
        { event: "ORDER_CREATED", at: order.createdAt, source: "ORDER.createdAt" },
        { event: `ORDER_STATUS_${String(order.status).toUpperCase()}`, at: order.updatedAt, source: "ORDER.updatedAt" },
      ],
      unavailableReason:
        "Order schema does not persist carrier, tracking number, shippedAt or receivedAt",
    },
  };
}

async function getAuthorizedSafetyDispute({ disputeId, userId, role, roles }) {
  const isTrustAndSafety =
    hasRole(role, roles, "TRUST_AND_SAFETY") || hasRole(role, roles, "ADMIN");
  if (!isTrustAndSafety) {
    throw forbidden("only Trust & Safety can view buyer-seller chat history");
  }
  const dispute = await disputeModel.findById(disputeId);
  if (!dispute) throw notFound("dispute not found");
  if (
    dispute.assignedRole === "TRUST_AND_SAFETY" &&
    dispute.assignedTo &&
    dispute.assignedTo !== userId &&
    !hasRole(role, roles, "ADMIN")
  ) {
    throw forbidden("this escalated dispute is assigned to another officer");
  }
  return dispute;
}

async function getChatHistory({ disputeId, userId, role, roles, before, limit }) {
  const dispute = await getAuthorizedSafetyDispute({
    disputeId,
    userId,
    role,
    roles,
  });
  const parsedLimit = limit === undefined ? 30 : Number(limit);
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
    throw badRequest("limit must be an integer between 1 and 100");
  }

  let transcript;
  try {
    transcript = await chatClient.getOrderTranscript(dispute.orderId, {
      before,
      limit: parsedLimit,
    });
  } catch (err) {
    await disputeModel.auditLog({
      disputeId,
      actorId: userId,
      action: "CHAT_HISTORY_UNAVAILABLE",
      detail: err.message,
    });
    throw new AppError(503, `chat history is unavailable: ${err.message}`);
  }

  if (!transcript) {
    await disputeModel.auditLog({
      disputeId,
      actorId: userId,
      action: "VIEW_CHAT_HISTORY",
      detail: "ORDER conversation not found",
    });
    return {
      available: false,
      conversation: null,
      items: [],
      nextCursor: null,
      reason: "No ORDER conversation has been persisted for this order",
    };
  }

  const activeParticipants = new Set(
    (transcript.conversation.participants || [])
      .filter((participant) => !participant.leftAt)
      .map((participant) => participant.userId),
  );
  if (
    !activeParticipants.has(dispute.order.buyerId) ||
    !activeParticipants.has(dispute.order.sellerId)
  ) {
    throw conflict("ORDER conversation participants do not match this order");
  }

  await disputeModel.auditLog({
    disputeId,
    actorId: userId,
    action: "VIEW_CHAT_HISTORY",
    detail: `conversation=${transcript.conversation.id};before=${before || "latest"};limit=${parsedLimit}`,
  });
  return {
    available: true,
    conversation: {
      id: transcript.conversation.id,
      status: transcript.conversation.status,
      contextType: transcript.conversation.contextType,
      contextId: transcript.conversation.contextId,
    },
    items: (transcript.items || transcript.messages || []).map((message) => ({
      ...message,
      payload: message.payload
        ? {
            filename: message.payload.filename || null,
            mimeType: message.payload.mimeType || null,
            size: message.payload.size || null,
          }
        : null,
    })),
    nextCursor: transcript.nextCursor || null,
  };
}

async function getChatAttachment({
  disputeId,
  messageId,
  userId,
  role,
  roles,
}) {
  if (!messageId) throw badRequest("messageId is required");
  const dispute = await getAuthorizedSafetyDispute({
    disputeId,
    userId,
    role,
    roles,
  });
  let attachment;
  try {
    attachment = await chatClient.getOrderAttachment(dispute.orderId, messageId);
  } catch (err) {
    await disputeModel.auditLog({
      disputeId,
      actorId: userId,
      action: "CHAT_ATTACHMENT_UNAVAILABLE",
      detail: `${messageId}: ${err.message}`,
    });
    throw new AppError(503, `chat attachment is unavailable: ${err.message}`);
  }
  if (!attachment) throw notFound("chat attachment not found");

  const activeParticipants = new Set(
    (attachment.conversation.participants || [])
      .filter((participant) => !participant.leftAt)
      .map((participant) => participant.userId),
  );
  if (
    !activeParticipants.has(dispute.order.buyerId) ||
    !activeParticipants.has(dispute.order.sellerId)
  ) {
    throw conflict("ORDER conversation participants do not match this order");
  }
  await disputeModel.auditLog({
    disputeId,
    actorId: userId,
    action: "VIEW_CHAT_ATTACHMENT",
    detail: messageId,
  });
  return attachment;
}

async function listQueue({ role, roles, status, search, skip, take }) {
  if (!isAgent(role, roles)) {
    throw forbidden("only support agents can view the dispute queue");
  }
  return disputeModel.listQueue({ status, search, skip, take });
}

async function getDashboardMetrics({ role, roles }) {
  if (!isAgent(role, roles)) {
    throw forbidden("only support agents can view dispute metrics");
  }
  return disputeModel.dashboardMetrics();
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
  if (isAgent(role, roles)) {
    const hasSafetyOversight =
      hasRole(role, roles, "TRUST_AND_SAFETY") || hasRole(role, roles, "ADMIN");
    if (
      dispute.assignedRole === "TRUST_AND_SAFETY" &&
      !hasSafetyOversight
    ) {
      throw forbidden("only Trust & Safety can view evidence for this escalated dispute");
    }
    if (
      dispute.assignedTo &&
      dispute.assignedTo !== userId &&
      !hasSafetyOversight
    ) {
      throw forbidden("only the assigned officer can view this evidence");
    }
  }

  const evidence = await disputeModel.findEvidence(disputeId, evidenceId);
  if (!evidence) throw notFound("evidence not found");

  const filePath = absolutePath(evidence.storageKey);
  if (!fs.existsSync(filePath)) {
    await disputeModel.auditLog({
      disputeId,
      actorId: userId,
      action: "EVIDENCE_MISSING",
      detail: evidenceId,
    });
    throw notFound("evidence file is unavailable");
  }

  await disputeModel.auditLog({
    disputeId,
    actorId: userId,
    action: "VIEW_EVIDENCE",
    detail: evidenceId,
  });

  return {
    path: filePath,
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
  getDashboardMetrics,
  getChatHistory,
  getChatAttachment,
};
