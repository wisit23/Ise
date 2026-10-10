const {
  STAFF_ROLES,
  badRequest,
  forbidden,
  notFound,
  conflict,
  scoreCase,
  disputeDeadlines,
  disputeSla,
  enrichStaffRows,
} = require("@reloop/shared");

const orderModel = require("../../models/orderModel");
const disputeModel = require("./disputeModel");
const authClient = require("../../services/authClient");
const chatClient = require("../../services/chatClient");
const { absolutePath } = require("./evidenceStorage");

const { disputeCapabilities } = require("./workspacePolicy");
const AGENT_ROLES = new Set(STAFF_ROLES);
const DECISIONS = ["APPROVE_REFUND", "RELEASE_ESCROW", "REJECT"];

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
  if (hasRole(role, roles, "ADMIN") || hasRole(role, roles, "TRUST_AND_SAFETY"))
    return dispute;
  if (hasRole(role, roles, "CUSTOMER_SERVICE")) {
    if (dispute.assignedRole === "ADMIN")
      throw forbidden("this dispute is in the Admin queue");
    if (!dispute.assignedTo || dispute.assignedTo === userId) return dispute;
    throw forbidden("only the assigned agent can inspect this dispute");
  }
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

  let reportCount = 0;
  let riskLookupAvailable = true;
  try {
    const seller = await authClient.getUser(order.sellerId);
    reportCount = seller?.reportCount || 0;
  } catch (err) {
    riskLookupAvailable = false;
    console.error(`[disputeService] risk lookup unavailable: ${err.message}`);
  }
  const amount = order.finalPrice ?? order.price ?? 0;
  const initial = scoreCase({ amount, reportCount, reason, isDispute: true });
  const startedAt = new Date();
  const deadlines = disputeDeadlines(initial.priority, startedAt);

  try {
    return await disputeModel.openDispute({
      orderId,
      openedBy: userId,
      reason: reason.trim(),
      expectedVersion: order.version,
      priority: initial.priority,
      priorityScore: initial.priorityScore,
      riskReportCount: reportCount,
      ...deadlines,
      createdAt: startedAt,
      classification: { ...initial, riskLookupAvailable },
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
  if (isAgent(role, roles)) {
    const order = await orderModel.findById(dispute.orderId);
    const summary = order
      ? {
          id: order.id,
          buyerId: order.buyerId,
          sellerId: order.sellerId,
          price: order.price,
          finalPrice: order.finalPrice,
          productTitle: order.productTitle,
          status: order.status,
          payoutHeld: order.payoutHeld,
        }
      : null;
    const [row] = await enrichStaffRows(
      [
        {
          ...dispute,
          buyerId: summary?.buyerId,
          sellerId: summary?.sellerId,
          assigneeId: dispute.assignedTo,
        },
      ],
      ["buyerId", "sellerId", "assigneeId"],
    );
    return {
      ...row,
      order: summary,
      capabilities: disputeCapabilities(dispute, userId, role, roles),
      sla: disputeSla(dispute),
    };
  }
  return dispute;
}

/** Convenience lookup for the frontend: a CSS-002 order-search result only
 * has the order id, so the case detail page needs to resolve that to its
 * dispute without knowing the dispute's own id up front. */
async function getByOrderId({ orderId, userId, role, roles }) {
  const dispute = await disputeModel.findByOrderId(orderId);
  if (!dispute) throw notFound("this order has no dispute");
  await assertAccess({ dispute, userId, role, roles });
  if (isAgent(role, roles)) {
    const order = await orderModel.findById(dispute.orderId);
    const summary = order
      ? {
          id: order.id,
          buyerId: order.buyerId,
          sellerId: order.sellerId,
          price: order.price,
          finalPrice: order.finalPrice,
          productTitle: order.productTitle,
          status: order.status,
          payoutHeld: order.payoutHeld,
        }
      : null;
    const [row] = await enrichStaffRows(
      [
        {
          ...dispute,
          buyerId: summary?.buyerId,
          sellerId: summary?.sellerId,
          assigneeId: dispute.assignedTo,
        },
      ],
      ["buyerId", "sellerId", "assigneeId"],
    );
    return {
      ...row,
      order: summary,
      capabilities: disputeCapabilities(dispute, userId, role, roles),
      sla: disputeSla(dispute),
    };
  }
  return dispute;
}

async function joinConversation({ disputeId, userId, role, roles, side }) {
  const dispute = await getById({ disputeId, userId, role, roles });
  const order = await orderModel.findById(dispute.orderId);
  if (!order) throw notFound("order not found");

  let chatRole;
  if (userId === order.buyerId) {
    if (side && side !== "buyer")
      throw forbidden("buyer cannot open seller chat");
    side = "buyer";
    chatRole = "BUYER";
  } else if (userId === order.sellerId) {
    if (side && side !== "seller")
      throw forbidden("seller cannot open buyer chat");
    side = "seller";
    chatRole = "SELLER";
  } else if (
    hasRole(role, roles, "ADMIN") ||
    hasRole(role, roles, "TRUST_AND_SAFETY")
  ) {
    chatRole = "ADMIN";
  } else if (hasRole(role, roles, "CUSTOMER_SERVICE")) {
    if (
      dispute.assignedRole === "TRUST_AND_SAFETY" ||
      dispute.assignedTo !== userId
    ) {
      throw forbidden("only the assigned agent can join this dispute chat");
    }
    chatRole = "AGENT";
  } else throw forbidden("you do not have access to this dispute chat");

  if (!side) side = "buyer";
  if (side !== "buyer" && side !== "seller")
    throw badRequest("side must be buyer or seller");

  const conversationId = await chatClient.joinDisputeConversation(
    dispute,
    order,
    {
      userId,
      role: chatRole,
    },
    side,
  );
  return {
    conversationId,
    side,
    readOnly: chatRole === "ADMIN" || dispute.status === "DECIDED",
  };
}

async function listQueue({
  role,
  roles,
  status,
  assignedRole,
  search,
  skip,
  take,
  scope,
  work,
  userId,
  priority,
  sort,
}) {
  if (!isAgent(role, roles)) {
    throw forbidden("only support agents can view the dispute queue");
  }
  if (work && !["open", "overdue", "soon", "reply"].includes(work))
    throw badRequest("invalid work filter");
  if (scope && !["mine", "unassigned", "all"].includes(scope))
    throw badRequest("invalid scope");
  if (status && !["OPEN", "NEEDS_INFO", "DECIDED"].includes(status))
    throw badRequest("invalid status");
  if (
    priority &&
    !["LOW", "NORMAL", "HIGH", "URGENT", "CRITICAL"].includes(priority)
  )
    throw badRequest("invalid priority");
  if (sort && !["sla", "newest", "oldest", "priority"].includes(sort))
    throw badRequest("invalid sort");
  const restricted =
    !hasRole(role, roles, "ADMIN") && !hasRole(role, roles, "TRUST_AND_SAFETY");
  const replyIds =
    work === "reply"
      ? await require("@reloop/shared/src/awaitingReply").awaitingReplyIds(
          require("../../models/prismaClient"),
          require("../../generated/prisma-client").Prisma,
          require("./agentDashboard").disputeDashboardBase(userId),
          userId,
          "disputes",
        )
      : undefined;
  const queue = await disputeModel.listQueue({
    replyIds,
    status,
    assignedRole,
    search,
    skip,
    take,
    scope,
    work,
    userId,
    restricted,
    priority,
    sort,
  });
  const items = await enrichStaffRows(
    queue.items.map((item) => ({
      ...item,
      buyerId: item.order?.buyerId,
      sellerId: item.order?.sellerId,
      assigneeId: item.assignedTo,
    })),
    ["buyerId", "sellerId", "assigneeId"],
  );
  return {
    ...queue,
    items: items.map((item) => ({
      ...item,
      capabilities: disputeCapabilities(item, userId, role, roles),
      queuePriority: item.priority,
      sla: disputeSla(item),
      priorityScore: scoreCase({
        priority: item.priority,
        amount: item.order?.finalPrice ?? item.order?.price,
        reportCount: item.riskReportCount,
        reason: item.reason,
        slaExpiresAt: item.slaExpiresAt,
        isDispute: true,
      }).priorityScore,
    })),
  };
}

async function addEvidence({ disputeId, userId, role, roles, file }) {
  if (!file) throw badRequest("a file is required");
  if (hasRole(role, roles, "ADMIN"))
    throw forbidden("Admin can review evidence but cannot submit it");
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
  if (hasRole(role, roles, "ADMIN") && dispute.assignedRole !== "ADMIN") {
    throw forbidden("Admin can claim only escalated disputes");
  }
  if (dispute.assignedRole === "ADMIN" && !hasRole(role, roles, "ADMIN")) {
    throw forbidden("only Admin can claim this escalated dispute");
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
  const isAdmin = hasRole(role, roles, "ADMIN");
  if (!isCurrentAssignee && !isTrustAndSafety && !isAdmin) {
    throw forbidden(
      "only the currently assigned agent or Trust & Safety can reassign this dispute",
    );
  }

  if (dispute.assignedRole === "TRUST_AND_SAFETY" && !isTrustAndSafety) {
    throw forbidden(
      "only Trust & Safety staff can reassign this escalated dispute",
    );
  }
  if (dispute.assignedRole === "ADMIN" && !isAdmin) {
    throw forbidden("only Admin can reassign this escalated dispute");
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
  const isTargetAdmin = targetRoles.includes("ADMIN");
  const isTargetTS = targetRoles.includes("TRUST_AND_SAFETY");
  const isTargetCS = targetRoles.includes("CUSTOMER_SERVICE");
  if (!isTargetAdmin && !isTargetTS && !isTargetCS) {
    throw badRequest("target user is not authorized to handle disputes");
  }
  if (
    isTargetAdmin &&
    dispute.assignedRole !== "ADMIN" &&
    !isTargetCS &&
    !isTargetTS
  ) {
    throw forbidden("escalate to Admin before assigning an Admin");
  }

  const targetRole =
    dispute.assignedRole === "ADMIN"
      ? "ADMIN"
      : dispute.assignedRole === "TRUST_AND_SAFETY"
        ? "TRUST_AND_SAFETY"
        : isTargetCS
          ? "CUSTOMER_SERVICE"
          : "TRUST_AND_SAFETY";

  if (dispute.assignedRole === "TRUST_AND_SAFETY" && !isTargetTS) {
    throw forbidden(
      "only Trust & Safety staff can be assigned to this escalated dispute",
    );
  }
  if (dispute.assignedRole === "ADMIN" && !isTargetAdmin) {
    throw forbidden("only Admin can be assigned to this escalated dispute");
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

/** Escalate dispute to Admin for a financial verdict. */
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
    if (!targetRoles.includes("ADMIN")) {
      throw badRequest("target user must be Admin staff");
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
  idempotencyKey,
}) {
  if (!hasRole(role, roles, "ADMIN"))
    throw forbidden("only Admin can decide a dispute");
  if (typeof version !== "number") {
    throw badRequest("version is required and must be a number");
  }
  if (!DECISIONS.includes(decision)) {
    throw badRequest(`decision must be one of ${DECISIONS.join(", ")}`);
  }
  if (!reason?.trim()) throw badRequest("reason is required");

  const dispute = await disputeModel.findById(disputeId);
  if (!dispute) throw notFound("dispute not found");

  if (
    !idempotencyKey ||
    typeof idempotencyKey !== "string" ||
    idempotencyKey.length > 128
  ) {
    throw badRequest("idempotencyKey is required (maximum 128 characters)");
  }
  if (dispute.status === "DECIDED") {
    if (
      dispute.verdictKey === idempotencyKey &&
      dispute.decidedBy === userId &&
      dispute.decision === decision &&
      dispute.decisionReason === reason.trim()
    ) {
      const order = await orderModel.findById(dispute.orderId);
      if (!order) throw notFound("order not found");
      return deliverVerdictNotice(dispute, order);
    }
    throw conflict("this dispute already has a decision");
  }

  // TSR-02 / ADM-DEC-025: Escalated dispute can only be decided by Trust & Safety
  if (dispute.assignedRole !== "ADMIN")
    throw forbidden("dispute must be escalated to Admin before a verdict");

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
    verdictKey: idempotencyKey,
  });
  if (!updated) {
    const latest = await disputeModel.findById(disputeId);
    if (
      latest?.verdictKey === idempotencyKey &&
      latest.decidedBy === userId &&
      latest.decision === decision &&
      latest.decisionReason === reason.trim()
    )
      return deliverVerdictNotice(latest, order);
    throw conflict("this dispute already has a decision");
  }
  return deliverVerdictNotice(updated, order);
}

async function deliverVerdictNotice(dispute, order) {
  try {
    const outcome =
      dispute.decision === "APPROVE_REFUND"
        ? "คืนเงินผู้ซื้อ"
        : "ปล่อยเงินให้ผู้ขาย";
    await chatClient.sendDisputeNotice(
      dispute,
      order,
      `verdict:${dispute.verdictKey}`,
      `ผลการตัดสิน: ${outcome} — ${dispute.decisionReason}`,
    );
    await chatClient.lockDisputeConversation(dispute, order);
  } catch (err) {
    // The decision is committed in PostgreSQL. A later chat open retries the
    // lock; expose the failed side effect so operators can reconcile it.
    console.error(
      `[disputeService] verdict notice/lock failed for ${dispute.id}: ${err.message}`,
    );
    return { ...dispute, chatLockError: err.message };
  }
  return dispute;
}

async function requestMoreEvidence({
  disputeId,
  userId,
  role,
  roles,
  reason,
  version,
}) {
  if (!hasRole(role, roles, "ADMIN"))
    throw forbidden("only Admin can request more evidence");
  if (!reason?.trim()) throw badRequest("reason is required");
  if (typeof version !== "number") throw badRequest("version is required");
  const dispute = await disputeModel.findById(disputeId);
  if (!dispute) throw notFound("dispute not found");
  if (dispute.status === "DECIDED") throw conflict("dispute already decided");
  if (dispute.assignedRole !== "ADMIN" || dispute.assignedTo !== userId) {
    throw forbidden("only the assigned Admin can return this dispute");
  }
  const updated = await disputeModel.requestMoreEvidence({
    id: disputeId,
    version,
    actorId: userId,
    reason: reason.trim(),
  });
  if (!updated) throw conflict("dispute changed; reload and retry");
  const order = await orderModel.findById(updated.orderId);
  if (order) {
    try {
      await chatClient.sendDisputeNotice(
        updated,
        order,
        `request-evidence:${updated.version}`,
        `Admin ขอหลักฐานเพิ่มเติม: ${reason.trim()}`,
      );
    } catch (err) {
      console.error(
        `[disputeService] evidence request notice failed: ${err.message}`,
      );
      return { ...updated, chatNoticeError: err.message };
    }
  }
  return updated;
}

async function getAuditTranscript({
  disputeId,
  userId,
  role,
  roles,
  side,
  before,
}) {
  if (!hasRole(role, roles, "ADMIN"))
    throw forbidden("only Admin can read dispute audit logs");
  if (!["buyer", "seller", "legacy"].includes(side))
    throw badRequest("invalid transcript side");
  const dispute = await disputeModel.findById(disputeId);
  if (!dispute) throw notFound("dispute not found");
  await disputeModel.auditLog({
    disputeId,
    actorId: userId,
    action: "VIEW_CHAT_TRANSCRIPT",
    detail: side,
  });
  return chatClient.getDisputeTranscript(disputeId, side, before);
}

module.exports = {
  async eligibleStaff({ disputeId, userId, role, roles, q, page, limit }) {
    const dispute = await getById({ disputeId, userId, role, roles });
    if (!disputeCapabilities(dispute, userId, role, roles).canReassign)
      throw forbidden("cannot reassign this dispute");
    const targetRoles =
      dispute.assignedRole === "ADMIN"
        ? ["ADMIN"]
        : dispute.assignedRole === "TRUST_AND_SAFETY"
          ? ["TRUST_AND_SAFETY"]
          : ["CUSTOMER_SERVICE", "TRUST_AND_SAFETY"];
    return authClient.searchStaff({ roles: targetRoles, q, page, limit });
  },
  open,
  getById,
  getByOrderId,
  joinConversation,
  addEvidence,
  viewEvidence,
  claim,
  reassign,
  escalate,
  decide,
  requestMoreEvidence,
  getAuditTranscript,
  listQueue,
};
