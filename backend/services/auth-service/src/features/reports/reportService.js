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
async function recordAdminAction({ actorId, action, targetId, reason, requestId }) {
  return prisma.adminAudit.create({
    data: { actorId, action, targetId, reason, requestId },
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

async function reviewReport({ reportId, adminId }) {
  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) throw notFound("report not found");
  if (report.status !== "OPEN") {
    throw conflict("report has already been reviewed");
  }

  return prisma.report.update({
    where: { id: reportId },
    data: { status: "REVIEWED", reviewedAt: new Date(), reviewedBy: adminId },
  });
}

const VALID_DECISIONS = ["SUSPEND_USER", "REMOVE_PRODUCT", "DISMISS"];

/**
 * A report must pass through REVIEWED first (reviewReport) — this keeps
 * the OPEN -> REVIEWED -> ACTIONED|DISMISSED lifecycle from plan.md strictly
 * sequential instead of letting a decision skip the review step.
 */
async function actionReport({ reportId, adminId, decision, reason, requestId }) {
  if (!VALID_DECISIONS.includes(decision)) {
    throw badRequest(
      "decision must be SUSPEND_USER, REMOVE_PRODUCT or DISMISS",
    );
  }
  if (!reason) throw badRequest("reason is required");

  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) throw notFound("report not found");
  if (report.status !== "REVIEWED") {
    throw conflict("report must be reviewed before it can be actioned");
  }

  if (decision === "SUSPEND_USER") {
    if (!report.targetId) {
      throw badRequest("report has no target user to suspend");
    }
    await suspendUser({ targetId: report.targetId, adminId, reason, requestId });
  } else if (decision === "REMOVE_PRODUCT") {
    if (!report.productId) {
      throw badRequest("report has no target product to remove");
    }
    await productModerationClient.removeProduct(report.productId, reason);
  }

  const updated = await prisma.report.update({
    where: { id: reportId },
    data: {
      status: decision === "DISMISS" ? "DISMISSED" : "ACTIONED",
      actionTaken: decision,
    },
  });

  await recordAdminAction({
    actorId: adminId,
    action: `REPORT_${decision}`,
    targetId: reportId,
    reason,
    requestId,
  });

  return updated;
}

async function suspendUser({ targetId, adminId, reason, requestId }) {
  if (!reason) throw badRequest("reason is required");
  if (targetId === adminId) throw forbidden("admins cannot suspend themselves");

  const user = await prisma.user.findUnique({ where: { id: targetId } });
  if (!user) throw notFound("user not found");
  if (user.status === "SUSPENDED") throw conflict("user is already suspended");

  const updated = await prisma.user.update({
    where: { id: targetId },
    data: { status: "SUSPENDED" },
  });
  await recordAdminAction({
    actorId: adminId,
    action: "USER_SUSPENDED",
    targetId,
    reason,
    requestId,
  });
  return toPublicUser(updated);
}

async function restoreUser({ targetId, adminId, reason, requestId }) {
  if (!reason) throw badRequest("reason is required");

  const user = await prisma.user.findUnique({ where: { id: targetId } });
  if (!user) throw notFound("user not found");
  if (user.status !== "SUSPENDED") throw conflict("user is not suspended");

  const updated = await prisma.user.update({
    where: { id: targetId },
    data: { status: "ACTIVE" },
  });
  await recordAdminAction({
    actorId: adminId,
    action: "USER_RESTORED",
    targetId,
    reason,
    requestId,
  });
  return toPublicUser(updated);
}

async function getUserSafetySummary(targetId) {
  const [reportCount, priorActions] = await Promise.all([
    prisma.report.count({ where: { targetId } }),
    prisma.adminAudit.count({ where: { targetId } }),
  ]);

  return {
    // Cross-service completed-order count is out of ADM-003 scope (order-service
    // isn't an owned file here — see decision.md ADM-DEC-011): unavailable
    // rather than a fabricated zero, per integration.md's Gate 1 rule.
    completedOrders: null,
    completedOrdersAvailable: false,
    reportCount,
    priorActions,
  };
}

module.exports = {
  listReports,
  reviewReport,
  actionReport,
  suspendUser,
  restoreUser,
  getUserSafetySummary,
  recordAdminAction,
};
