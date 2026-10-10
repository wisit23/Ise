const {
  badRequest,
  conflict,
  forbidden,
  isRestrictedStatus,
  notFound,
  restrictionsForStatus,
} = require("@reloop/shared");
const prisma = require("../../models/prismaClient");
const productModerationClient = require("../../services/productModerationClient");
const { lockUser } = require("../../services/sessionService");

function toPublicUser(user) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    status: user.status,
    commerceRestrictions: restrictionsForStatus(user.status),
  };
}

/** Append-only — never updated or deleted (ADM-DEC-003: audit evidence must persist). */
async function recordAdminAction({
  actorId,
  action,
  targetId,
  reason,
  requestId,
  tx = prisma,
}) {
  return tx.adminAudit.create({
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

function reportSearchWhere(search) {
  const query = search?.trim();
  if (!query) return {};
  return {
    OR: [
      { id: { contains: query, mode: "insensitive" } },
      { reporterId: { contains: query, mode: "insensitive" } },
      { targetId: { contains: query, mode: "insensitive" } },
      { productId: { contains: query, mode: "insensitive" } },
      { reason: { contains: query, mode: "insensitive" } },
      {
        reporter: {
          is: {
            OR: [
              { email: { contains: query, mode: "insensitive" } },
              { firstName: { contains: query, mode: "insensitive" } },
              { lastName: { contains: query, mode: "insensitive" } },
            ],
          },
        },
      },
    ],
  };
}

async function listReports({ page, limit, status, search }) {
  const searchWhere = reportSearchWhere(search);
  const where = {};
  if (status === undefined || status === null) where.status = "OPEN";
  else if (status.trim()) where.status = status.trim();
  Object.assign(where, searchWhere);
  const [items, total] = await Promise.all([
    prisma.report.findMany({
      where,
      include: {
        reporter: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
      orderBy: { reportedAt: "asc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.report.count({ where }),
  ]);
  return { items, total };
}

async function getReportDetail(reportId) {
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    include: {
      reporter: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          status: true,
        },
      },
    },
  });
  if (!report) throw notFound("report not found");

  const decisionPromise = prisma.adminAudit.findFirst({
    where: {
      targetId: reportId,
      action: { startsWith: "REPORT_", not: "REPORT_REVIEWED" },
    },
    orderBy: { createdAt: "desc" },
  });
  const targetPromise = report.targetId
    ? prisma.user.findUnique({
        where: { id: report.targetId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          status: true,
        },
      })
    : Promise.resolve(null);
  const productPromise = report.productId
    ? productModerationClient
        .getProduct(report.productId)
        .then((product) => ({ available: true, product }))
        .catch((error) => ({ available: false, error: error.message }))
    : Promise.resolve(null);

  const [decision, target, productDetail, reporterSafety, targetSafety] =
    await Promise.all([
      decisionPromise,
      targetPromise,
      productPromise,
      getUserSafetySummary(report.reporterId),
      report.targetId
        ? getUserSafetySummary(report.targetId)
        : Promise.resolve(null),
    ]);
  const decider = decision
    ? await prisma.user.findUnique({
        where: { id: decision.actorId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      })
    : null;

  return {
    ...report,
    reporter: { ...report.reporter, safetySummary: reporterSafety },
    target: target ? { ...target, safetySummary: targetSafety } : null,
    productDetail,
    decision: decision
      ? {
          action: report.actionTaken || decision.action.replace(/^REPORT_/, ""),
          reason: decision.reason,
          decidedAt: decision.createdAt,
          decidedBy: decider || { id: decision.actorId },
        }
      : null,
  };
}

async function reviewReport({ reportId, adminId, staffId, requestId }) {
  const actorId = staffId || adminId;
  return prisma.$transaction(async (tx) => {
    const report = await tx.report.findUnique({ where: { id: reportId } });
    if (!report) throw notFound("report not found");
    const claimed = await tx.report.updateMany({
      where: { id: reportId, status: "OPEN" },
      data: {
        status: "REVIEWED",
        reviewedAt: new Date(),
        reviewedBy: actorId,
      },
    });
    if (claimed.count !== 1) {
      throw conflict("report has already been reviewed or modified");
    }
    await recordAdminAction({
      actorId,
      action: "REPORT_REVIEWED",
      targetId: reportId,
      reason: "accepted for review",
      requestId,
      tx,
    });
    return tx.report.findUnique({ where: { id: reportId } });
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
  idempotencyKey,
}) {
  const actorId = staffId || adminId;
  const trimmedReason = reason?.trim();

  if (!VALID_DECISIONS.includes(decision)) {
    throw badRequest(`decision must be one of ${VALID_DECISIONS.join(", ")}`);
  }
  if (!trimmedReason) throw badRequest("reason is required");

  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) throw notFound("report not found");

  if (decision === "REMOVE_PRODUCT") {
    if (!report.productId) {
      throw badRequest("report has no target product to remove");
    }
    if (
      report.status !== "REVIEWED" &&
      !(report.status === "ACTIONED" && report.actionTaken === decision)
    ) {
      throw conflict("report must be reviewed before it can be actioned");
    }
    return actionProductReport({
      report,
      actorId,
      reason: trimmedReason,
      requestId,
      idempotencyKey: idempotencyKey || `report:${reportId}:REMOVE_PRODUCT`,
    });
  }

  if (report.status !== "REVIEWED") {
    throw conflict("report must be reviewed before it can be actioned");
  }

  return prisma.$transaction(async (tx) => {
    const claimed = await tx.report.updateMany({
      where: { id: reportId, status: "REVIEWED" },
      data: {
        status: decision === "DISMISS" ? "DISMISSED" : "ACTIONED",
        actionTaken: decision,
      },
    });
    if (claimed.count !== 1) {
      throw conflict("report was already actioned or modified");
    }

    if (decision === "SUSPEND_USER") {
      if (!report.targetId) {
        throw badRequest("report has no target user to suspend");
      }
      await suspendUserInTx(tx, {
        targetId: report.targetId,
        actorId,
        reason: trimmedReason,
        requestId,
      });
    } else if (decision === "WARN_USER") {
      if (!report.targetId) {
        throw badRequest("report has no target user to warn");
      }
      await warnUserInTx(tx, {
        targetId: report.targetId,
        actorId,
        reason: trimmedReason,
        requestId,
      });
    }

    await recordAdminAction({
      actorId,
      action: `REPORT_${decision}`,
      targetId: reportId,
      reason: trimmedReason,
      requestId,
      tx,
    });

    return tx.report.findUnique({ where: { id: reportId } });
  });
}

async function actionProductReport({
  report,
  actorId,
  reason,
  requestId,
  idempotencyKey,
}) {
  const latest = await prisma.report.findUnique({ where: { id: report.id } });
  if (
    latest?.status === "ACTIONED" &&
    latest.actionTaken === "REMOVE_PRODUCT"
  ) {
    return latest;
  }
  if (latest?.status !== "REVIEWED") {
    throw conflict("report must be reviewed before it can be actioned");
  }

  await productModerationClient.removeProduct(
    report.productId,
    reason,
    idempotencyKey,
  );
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.report.updateMany({
      where: { id: report.id, status: "REVIEWED" },
      data: { status: "ACTIONED", actionTaken: "REMOVE_PRODUCT" },
    });
    if (claimed.count !== 1) {
      const replay = await tx.report.findUnique({ where: { id: report.id } });
      if (
        replay?.status === "ACTIONED" &&
        replay.actionTaken === "REMOVE_PRODUCT"
      ) {
        return replay;
      }
      throw conflict("report was already actioned or modified");
    }
    await recordAdminAction({
      actorId,
      action: "REPORT_REMOVE_PRODUCT",
      targetId: report.id,
      reason,
      requestId,
      tx,
    });
    return tx.report.findUnique({ where: { id: report.id } });
  });
}

async function suspendUserInTx(tx, { targetId, actorId, reason, requestId }) {
  if (targetId === actorId) throw forbidden("staff cannot suspend themselves");
  const user = await lockUser(tx, targetId);
  if (!user) throw notFound("user not found");
  if (user.status === "SUSPENDED") throw conflict("user is already suspended");
  if (isRestrictedStatus(user.status)) {
    throw conflict(
      "revoke the commerce restriction before fully suspending this account",
    );
  }
  const updated = await tx.user.update({
    where: { id: targetId },
    data: { status: "SUSPENDED" },
  });
  await tx.refreshToken.updateMany({
    where: { userId: targetId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await recordAdminAction({
    actorId,
    action: "USER_SUSPENDED",
    targetId,
    reason,
    requestId,
    tx,
  });
  return toPublicUser(updated);
}

async function warnUserInTx(tx, { targetId, actorId, reason, requestId }) {
  if (targetId === actorId) throw forbidden("staff cannot warn themselves");
  const user = await tx.user.findUnique({ where: { id: targetId } });
  if (!user) throw notFound("user not found");
  await recordAdminAction({
    actorId,
    action: "USER_WARNED",
    targetId,
    reason,
    requestId,
    tx,
  });
  return toPublicUser(user);
}

async function suspendUser({ targetId, adminId, staffId, reason, requestId }) {
  const actorId = staffId || adminId;
  const trimmedReason = reason?.trim();
  if (!trimmedReason) throw badRequest("reason is required");
  if (targetId === actorId) throw forbidden("staff cannot suspend themselves");

  return prisma.$transaction((tx) =>
    suspendUserInTx(tx, {
      targetId,
      actorId,
      reason: trimmedReason,
      requestId,
    }),
  );
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

  return prisma.$transaction((tx) =>
    warnUserInTx(tx, {
      targetId,
      actorId,
      reason: trimmedReason,
      requestId,
    }),
  );
}

async function restoreUser({ targetId, adminId, staffId, reason, requestId }) {
  const actorId = staffId || adminId;
  const trimmedReason = reason?.trim();
  if (!trimmedReason) throw badRequest("reason is required");

  return prisma.$transaction(async (tx) => {
    const user = await lockUser(tx, targetId);
    if (!user) throw notFound("user not found");
    if (user.status !== "SUSPENDED") throw conflict("user is not suspended");

    const updated = await tx.user.update({
      where: { id: targetId },
      data: { status: "ACTIVE" },
    });
    // Also invalidates sessions belonging to accounts suspended before rollout.
    await tx.refreshToken.updateMany({
      where: { userId: targetId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await tx.adminAudit.create({
      data: {
        actorId,
        action: "USER_RESTORED",
        targetId,
        reason: trimmedReason,
        requestId,
      },
    });
    return toPublicUser(updated);
  });
}

async function getUserSafetySummary(targetId) {
  const [
    reportCount,
    priorActions,
    suspensionCount,
    warningCount,
    restoreCount,
  ] = await Promise.all([
    prisma.report.count({ where: { targetId } }),
    prisma.adminAudit.count({ where: { targetId } }),
    prisma.adminAudit.count({
      where: { targetId, action: "USER_SUSPENDED" },
    }),
    prisma.adminAudit.count({
      where: { targetId, action: "USER_WARNED" },
    }),
    prisma.adminAudit.count({
      where: { targetId, action: "USER_RESTORED" },
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
    restoreCount,
  };
}

const USER_ACTIONS = [
  "USER_WARNED",
  "USER_SUSPENDED",
  "USER_RESTORED",
  "COMMERCE_RESTRICTED_BUYER",
  "COMMERCE_RESTRICTED_SELLER",
  "COMMERCE_RESTRICTED_ALL",
  "COMMERCE_RESTRICTION_REVOKED",
];

async function listUserHistory({ targetId, kind, page, limit }) {
  if (kind === "reports") {
    const where = { targetId };
    const [items, total] = await Promise.all([
      prisma.report.findMany({
        where,
        select: {
          id: true,
          reporterId: true,
          productId: true,
          reason: true,
          status: true,
          actionTaken: true,
          reportedAt: true,
          reviewedAt: true,
        },
        orderBy: [{ reportedAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.report.count({ where }),
    ]);
    return { items, total };
  }

  if (kind !== "actions") {
    throw badRequest("kind must be one of reports or actions");
  }
  const where = { targetId, action: { in: USER_ACTIONS } };
  const [audits, total] = await Promise.all([
    prisma.adminAudit.findMany({
      where,
      include: {
        actor: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.adminAudit.count({ where }),
  ]);

  const requestIds = audits.map((item) => item.requestId).filter(Boolean);
  const sources = requestIds.length
    ? await prisma.adminAudit.findMany({
        where: {
          requestId: { in: requestIds },
          action: { startsWith: "REPORT_", not: "REPORT_REVIEWED" },
        },
        select: { requestId: true, targetId: true },
      })
    : [];
  const sourceByRequest = new Map(
    sources.map((source) => [source.requestId, source.targetId]),
  );
  return {
    total,
    items: audits.map((audit) => ({
      ...audit,
      sourceReportId: audit.requestId
        ? sourceByRequest.get(audit.requestId) || null
        : null,
    })),
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
      sellerProfile: {
        select: {
          shopName: true,
          kycStatus: true,
          verifiedAt: true,
        },
      },
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
    commerceRestrictions: restrictionsForStatus(user.status),
    createdAt: user.createdAt,
    roles,
    sellerProfile: user.sellerProfile
      ? {
          shopName: user.sellerProfile.shopName,
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
  getReportDetail,
  reviewReport,
  actionReport,
  suspendUser,
  warnUser,
  restoreUser,
  getUserSafetySummary,
  listUserHistory,
  getUserDetail,
  recordAdminAction,
};
