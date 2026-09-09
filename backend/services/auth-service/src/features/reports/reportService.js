const { badRequest, conflict, forbidden, notFound } = require("@reloop/shared");
const prisma = require("../../models/prismaClient");
const productModerationClient = require("../../services/productModerationClient");

function toPublicUser(user) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    status: user.status,
  };
}

/** Append-only — never updated or deleted (ADM-DEC-003: audit evidence must persist). */
async function recordAdminAction({
  actorId,
  action,
  targetId,
  reason,
  requestId,
}) {
  return prisma.adminAudit.create({
    data: { actorId, action, targetId, reason, requestId },
  });
}

/**
 * The consumer-facing half of the report flow — a Buyer/Seller flags a user
 * and/or a product (at least one of the two, never neither) with a reason.
 * Everything downstream (review, decide, dismiss) is Admin's existing flow;
 * this is only the missing "file a report" entry point into it.
 */
async function createReport({ reporterId, targetId, productId, reason }) {
  const trimmedReason = reason?.trim();
  if (!trimmedReason) throw badRequest("reason is required");
  if (!targetId && !productId) {
    throw badRequest("targetId or productId is required");
  }
  if (targetId === reporterId) throw badRequest("cannot report yourself");

  return prisma.report.create({
    data: {
      reporterId,
      targetId: targetId || null,
      productId: productId || null,
      reason: trimmedReason,
    },
  });
}

async function listReports({ page, limit, status }) {
  const where = { status: status || "OPEN" };
  const [items, total] = await Promise.all([
    prisma.report.findMany({
      where,
      orderBy: { reportedAt: "asc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.report.count({ where }),
  ]);
  return { items, total };
}

async function reviewReport({ reportId, adminId, staffId }) {
  const actorId = staffId || adminId;
  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) throw notFound("report not found");
  if (report.status !== "OPEN") {
    throw conflict("report has already been reviewed");
  }

  return prisma.report.update({
    where: { id: reportId },
    data: { status: "REVIEWED", reviewedAt: new Date(), reviewedBy: actorId },
  });
}

const VALID_DECISIONS = [
  "SUSPEND_USER",
  "WARN_USER",
  "REMOVE_PRODUCT",
  "DISMISS",
];

/**
 * A report must pass through REVIEWED first (reviewReport) — this keeps
 * the OPEN -> REVIEWED -> ACTIONED|DISMISSED lifecycle from plan.md strictly
 * sequential instead of letting a decision skip the review step.
 */
async function actionReport({
  reportId,
  adminId,
  staffId,
  decision,
  reason,
  requestId,
}) {
  const actorId = staffId || adminId;
  const trimmedReason = reason?.trim();

  if (!VALID_DECISIONS.includes(decision)) {
    throw badRequest(`decision must be one of ${VALID_DECISIONS.join(", ")}`);
  }
  if (!trimmedReason) throw badRequest("reason is required");

  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) throw notFound("report not found");
  if (report.status !== "REVIEWED") {
    throw conflict("report must be reviewed before it can be actioned");
  }

  if (decision === "SUSPEND_USER") {
    if (!report.targetId) {
      throw badRequest("report has no target user to suspend");
    }
    await suspendUser({
      targetId: report.targetId,
      adminId: actorId,
      staffId: actorId,
      reason: trimmedReason,
      requestId,
    });
  } else if (decision === "WARN_USER") {
    if (!report.targetId) {
      throw badRequest("report has no target user to warn");
    }
    await warnUser({
      targetId: report.targetId,
      adminId: actorId,
      staffId: actorId,
      reason: trimmedReason,
      requestId,
    });
  } else if (decision === "REMOVE_PRODUCT") {
    if (!report.productId) {
      throw badRequest("report has no target product to remove");
    }
    await productModerationClient.removeProduct(report.productId, trimmedReason);
  }

  const updated = await prisma.report.update({
    where: { id: reportId },
    data: {
      status: decision === "DISMISS" ? "DISMISSED" : "ACTIONED",
      actionTaken: decision,
    },
  });

  await recordAdminAction({
    actorId,
    action: `REPORT_${decision}`,
    targetId: reportId,
    reason: trimmedReason,
    requestId,
  });

  return updated;
}

async function suspendUser({ targetId, adminId, staffId, reason, requestId }) {
  const actorId = staffId || adminId;
  const trimmedReason = reason?.trim();
  if (!trimmedReason) throw badRequest("reason is required");
  if (targetId === actorId) throw forbidden("staff cannot suspend themselves");

  const user = await prisma.user.findUnique({ where: { id: targetId } });
  if (!user) throw notFound("user not found");
  if (user.status === "SUSPENDED") throw conflict("user is already suspended");

  const updated = await prisma.user.update({
    where: { id: targetId },
    data: { status: "SUSPENDED" },
  });
  await recordAdminAction({
    actorId,
    action: "USER_SUSPENDED",
    targetId,
    reason: trimmedReason,
    requestId,
  });
  return toPublicUser(updated);
}

/**
 * The lighter-touch counterpart to suspendUser — records a formal warning
 * against the user without touching account status. Keyed by the user's own
 * id (not the report's), so it feeds getUserSafetySummary's `priorActions`
 * count the same way USER_SUSPENDED does — a repeat offender with three
 * warnings and no suspension is still visible as a repeat offender.
 */
async function warnUser({ targetId, adminId, staffId, reason, requestId }) {
  const actorId = staffId || adminId;
  const trimmedReason = reason?.trim();
  if (!trimmedReason) throw badRequest("reason is required");
  if (targetId === actorId) throw forbidden("staff cannot warn themselves");

  const user = await prisma.user.findUnique({ where: { id: targetId } });
  if (!user) throw notFound("user not found");

  await recordAdminAction({
    actorId,
    action: "USER_WARNED",
    targetId,
    reason: trimmedReason,
    requestId,
  });
  return toPublicUser(user);
}

async function restoreUser({ targetId, adminId, staffId, reason, requestId }) {
  const actorId = staffId || adminId;
  const trimmedReason = reason?.trim();
  if (!trimmedReason) throw badRequest("reason is required");

  const user = await prisma.user.findUnique({ where: { id: targetId } });
  if (!user) throw notFound("user not found");
  if (user.status !== "SUSPENDED") throw conflict("user is not suspended");

  const updated = await prisma.user.update({
    where: { id: targetId },
    data: { status: "ACTIVE" },
  });
  await recordAdminAction({
    actorId,
    action: "USER_RESTORED",
    targetId,
    reason: trimmedReason,
    requestId,
  });
  return toPublicUser(updated);
}

async function getUserSafetySummary(targetId) {
  const [reportCount, priorActions, suspensionCount, warningCount] =
    await Promise.all([
      prisma.report.count({ where: { targetId } }),
      prisma.adminAudit.count({ where: { targetId } }),
      prisma.adminAudit.count({
        where: { targetId, action: "USER_SUSPENDED" },
      }),
      prisma.adminAudit.count({
        where: { targetId, action: "USER_WARNED" },
      }),
    ]);

  return {
    // Cross-service completed-order count is out of ADM-003 scope (order-service
    // isn't an owned file here — see decision.md ADM-DEC-011): unavailable
    // rather than a fabricated zero, per integration.md's Gate 1 rule.
    completedOrders: null,
    completedOrdersAvailable: false,
    reportCount,
    priorActions,
    suspensionCount,
    warningCount,
  };
}

async function getUserDetail(identifier) {
  if (!identifier || !identifier.trim()) {
    throw badRequest("user identifier is required");
  }
  const cleanId = identifier.trim();

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { id: cleanId },
        { email: cleanId },
        { sellerProfile: { shopName: cleanId } },
      ],
    },
    include: {
      sellerProfile: true,
      roles: true,
    },
  });

  if (!user) throw notFound("user not found");

  const safetySummary = await getUserSafetySummary(user.id);
  const roles =
    user.roles && user.roles.length > 0
      ? user.roles.map((r) => r.role)
      : [user.role];

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
    roles,
    sellerProfile: user.sellerProfile
      ? {
          shopName: user.sellerProfile.shopName,
          idCardNumber: user.sellerProfile.idCardNumber,
          address: user.sellerProfile.address,
          bankAccount: user.sellerProfile.bankAccount,
          kycStatus: user.sellerProfile.kycStatus,
          verifiedAt: user.sellerProfile.verifiedAt,
        }
      : null,
    safetySummary,
  };
}

module.exports = {
  createReport,
  listReports,
  reviewReport,
  actionReport,
  suspendUser,
  warnUser,
  restoreUser,
  getUserSafetySummary,
  getUserDetail,
  recordAdminAction,
};
