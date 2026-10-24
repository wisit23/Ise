const prisma = require("../../models/prismaClient");
const { DEFAULT_REPORT_LIMIT, ANOMALY_THRESHOLD } = require("./reportConfig");
const { findReportPage } = require("./reportSearch");

// The queue a complaint sits in until Trust & Safety closes it.
const OPEN_STATUSES = ["OPEN", "REVIEWED"];
// How many of the most-reported targets are checked for the repeat-complaint
// warning (a target is listed in topReported once it has more than one).
const MOST_REPORTED_LIMIT = 10;

function toItem(report, targetMap = new Map(), actionMap = {}) {
  const targetInfo = targetMap.get(report.targetId) || {};
  return {
    id: report.id,
    reason: report.reason,
    status: report.status,
    actionTaken: ["ACTIONED", "DISMISSED"].includes(report.status)
      ? report.actionTaken
      : null,
    actionDetails: actionMap[report.id] || null,
    reportedAt: report.reportedAt.toISOString(),
    targetId: report.targetId,
    targetName: targetInfo.name || null,
    targetShopName: targetInfo.shopName || null,
    targetReportCount: targetInfo.reportCount || 1,
    productId: report.productId,
    reporterName: report.reporter
      ? `${report.reporter.firstName} ${report.reporter.lastName}`.trim()
      : null,
  };
}

async function enrichReportActions(reports) {
  const completed = reports.filter(
    (report) =>
      ["ACTIONED", "DISMISSED"].includes(report.status) && report.actionTaken,
  );
  if (completed.length === 0) return {};

  // Report audit entries target the report ID; USER_* entries target a user.
  // Match the final decision too, so another action on the same user (or an
  // unrelated audit entry) cannot become this report's decision reason.
  const audits = await prisma.adminAudit.findMany({
    where: {
      OR: completed.map((report) => ({
        targetId: report.id,
        action: `REPORT_${report.actionTaken}`,
      })),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    distinct: ["targetId"],
    select: { targetId: true, actorId: true, reason: true },
  });
  if (audits.length === 0) return {};

  const actors = await prisma.user.findMany({
    where: { id: { in: [...new Set(audits.map((audit) => audit.actorId))] } },
    select: { id: true, firstName: true, lastName: true },
  });
  const names = new Map(
    actors.map((actor) => [
      actor.id,
      `${actor.firstName} ${actor.lastName}`.trim(),
    ]),
  );
  return Object.fromEntries(
    audits.map((audit) => [
      audit.targetId,
      {
        actorId: audit.actorId,
        actorName: names.get(audit.actorId) || null,
        reason: audit.reason,
      },
    ]),
  );
}

/**
 * Fetch and enrich target details (name, shopName, and report counts) for an array of target IDs.
 */
async function enrichTargets(allTargetIds = []) {
  if (allTargetIds.length === 0) return new Map();

  const [targetUsers, allReportCounts] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: allTargetIds } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        sellerProfile: { select: { shopName: true } },
      },
    }),
    prisma.report.groupBy({
      by: ["targetId"],
      where: { targetId: { in: allTargetIds } },
      _count: { _all: true },
    }),
  ]);

  const countMap = new Map(
    allReportCounts.map((c) => [c.targetId, c._count._all]),
  );

  const targetMap = new Map(
    targetUsers.map((u) => [
      u.id,
      {
        name: `${u.firstName} ${u.lastName}`.trim(),
        shopName: u.sellerProfile?.shopName || null,
        reportCount: countMap.get(u.id) || 1,
      },
    ]),
  );

  // Fill in entries for any target IDs without a matching user record
  for (const tId of allTargetIds) {
    if (!targetMap.has(tId)) {
      targetMap.set(tId, {
        name: null,
        shopName: null,
        reportCount: countMap.get(tId) || 1,
      });
    }
  }

  return targetMap;
}

/**
 * Complaints for the Executive complaints page (CEO-DEC-014), newest first:
 * - `status` narrows the list (default: the open queue; "ALL" for every one)
 * - `range` limits it to complaints reported in [from, to)
 * - each row names its target (user or shop) and how often it was reported
 * - `anomalySummary` flags targets with at least ANOMALY_THRESHOLD open
 *   complaints (the repeat-complaint warning)
 */
async function getReportOverview({
  range = null,
  status,
  limit = DEFAULT_REPORT_LIMIT,
  page = 1,
} = {}) {
  const [{ reports, total }, statusGroups, targetGroups] = await Promise.all([
    findReportPage(prisma, {
      range,
      status,
      page,
      limit,
      openStatuses: OPEN_STATUSES,
    }),
    prisma.report.groupBy({
      by: ["status"],
      ...(range
        ? { where: { reportedAt: { gte: range.from, lt: range.to } } }
        : {}),
      _count: { _all: true },
    }),
    prisma.report.groupBy({
      by: ["targetId"],
      where: { targetId: { not: null }, status: { in: OPEN_STATUSES } },
      _count: { _all: true },
      orderBy: { _count: { targetId: "desc" } },
      take: MOST_REPORTED_LIMIT,
    }),
  ]);

  // Collect target IDs to enrich with user/seller names and report count
  const allTargetIds = [
    ...new Set([
      ...reports.map((r) => r.targetId).filter(Boolean),
      ...targetGroups.map((g) => g.targetId).filter(Boolean),
    ]),
  ];

  const [targetMap, actionMap] = await Promise.all([
    enrichTargets(allTargetIds),
    enrichReportActions(reports),
  ]);

  const statusCounts = Object.fromEntries(
    statusGroups.map((g) => [g.status, g._count._all]),
  );

  const items = reports.map((r) => toItem(r, targetMap, actionMap));

  const topReported = targetGroups
    .filter((g) => g._count._all > 1)
    .map((g) => ({
      targetId: g.targetId,
      count: g._count._all,
      targetName: targetMap.get(g.targetId)?.name || null,
      targetShopName: targetMap.get(g.targetId)?.shopName || null,
    }));

  const highRiskTargets = topReported.filter(
    (t) => t.count >= ANOMALY_THRESHOLD,
  );

  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    statusCounts,
    totalOpen: (statusCounts.OPEN || 0) + (statusCounts.REVIEWED || 0),
    topReported,
    anomalySummary: {
      detected: highRiskTargets.length > 0,
      threshold: ANOMALY_THRESHOLD,
      highRiskTargets,
    },
  };
}

module.exports = { getReportOverview, OPEN_STATUSES };
