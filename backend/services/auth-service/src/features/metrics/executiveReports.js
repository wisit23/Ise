const prisma = require("../../models/prismaClient");
const { DEFAULT_REPORT_LIMIT, ANOMALY_THRESHOLD } = require("./reportConfig");
const { findReportPage } = require("./reportSearch");

const OPEN_STATUSES = ["OPEN", "REVIEWED"];
const DEFAULT_ANOMALY_THRESHOLD = ANOMALY_THRESHOLD;

const CATEGORY_KEYWORDS = {
  FRAUD: [
    "ฉ้อโกง",
    "หลอก",
    "โกง",
    "สลิปปลอม",
    "ไม่ส่งของ",
    "ไม่ส่งสินค้า",
    "ไม่จัดส่ง",
    "ไม่ส่ง",
    "มัดจำ",
  ],
  COUNTERFEIT: ["ลิขสิทธิ์", "กฎหมาย", "ปลอม", "ละเมิด"],
  MISMATCH: ["ไม่ตรงปก", "ชำรุด", "เสียหาย", "ผิดขนาด"],
};

function categorizeReason(reason = "") {
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => reason.includes(kw))) {
      return cat;
    }
  }
  return "OTHER";
}

function toItem(report, targetMap = new Map(), actionMap = {}) {
  const targetInfo = targetMap.get(report.targetId) || {};
  return {
    id: report.id,
    reason: report.reason,
    category: categorizeReason(report.reason),
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
 * `getReportOverview` serves the Executive complaints & risk monitoring tab.
 * Supports:
 * - Status filtering (OPEN, REVIEWED, ACTIONED, DISMISSED)
 * - Reason category filtering (FRAUD, COUNTERFEIT, MISMATCH)
 * - Target filtering (targetId)
 * - Sorting by `most_reported` (puts high-complaint targets at the top) or `newest`/`oldest`
 * - Target enrichment with shop/user name and total report frequency
 * - Anomaly detection flag when a target breaches the risk threshold (>= 3 complaints)
 */
async function getReportOverview({
  status,
  limit = DEFAULT_REPORT_LIMIT,
  sortBy = "newest",
  reasonCategory,
  targetId,
  search,
  page = 1,
} = {}) {
  const [{ reports, total }, statusGroups, targetGroups] = await Promise.all([
    findReportPage(
      prisma,
      { status, targetId, search, page, limit, sortBy, reasonCategory },
      { openStatuses: OPEN_STATUSES, categoryKeywords: CATEGORY_KEYWORDS },
    ),
    prisma.report.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.report.groupBy({
      by: ["targetId"],
      where: { targetId: { not: null }, status: { in: OPEN_STATUSES } },
      _count: { _all: true },
      orderBy: { _count: { targetId: "desc" } },
      take: 10,
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
    (t) => t.count >= DEFAULT_ANOMALY_THRESHOLD,
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
      threshold: DEFAULT_ANOMALY_THRESHOLD,
      highRiskTargets,
    },
  };
}

module.exports = {
  getReportOverview,
  enrichTargets,
  OPEN_STATUSES,
  CATEGORY_KEYWORDS,
  categorizeReason,
  DEFAULT_ANOMALY_THRESHOLD,
};
