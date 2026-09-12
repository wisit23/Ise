const prisma = require("../../models/prismaClient");

const OPEN_STATUSES = ["OPEN", "REVIEWED"];
const DEFAULT_ANOMALY_THRESHOLD = 3;

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

function toItem(report, targetMap = {}) {
  const targetInfo = targetMap[report.targetId] || {};
  return {
    id: report.id,
    reason: report.reason,
    category: categorizeReason(report.reason),
    status: report.status,
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

/**
 * Fetch and enrich target details (name, shopName, and report counts) for an array of target IDs.
 */
async function enrichTargets(allTargetIds = []) {
  if (allTargetIds.length === 0) return {};

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

  const countMap = Object.fromEntries(
    allReportCounts.map((c) => [c.targetId, c._count._all]),
  );

  const targetMap = Object.fromEntries(
    targetUsers.map((u) => [
      u.id,
      {
        name: `${u.firstName} ${u.lastName}`.trim(),
        shopName: u.sellerProfile?.shopName || null,
        reportCount: countMap[u.id] || 1,
      },
    ]),
  );

  // Fill in entries for any target IDs without a matching user record
  for (const tId of allTargetIds) {
    if (!targetMap[tId]) {
      targetMap[tId] = {
        name: null,
        shopName: null,
        reportCount: countMap[tId] || 1,
      };
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
  limit = 50,
  sortBy = "newest",
  reasonCategory,
  targetId,
} = {}) {
  const where = {};

  if (status) {
    where.status = status;
  } else {
    where.status = { in: OPEN_STATUSES };
  }

  if (targetId) {
    where.targetId = targetId;
  }

  if (reasonCategory && CATEGORY_KEYWORDS[reasonCategory]) {
    where.OR = CATEGORY_KEYWORDS[reasonCategory].map((kw) => ({
      reason: { contains: kw, mode: "insensitive" },
    }));
  }

  const [reports, statusGroups, targetGroups] = await Promise.all([
    prisma.report.findMany({
      where,
      orderBy: { reportedAt: sortBy === "oldest" ? "asc" : "desc" },
      take: limit,
      include: {
        reporter: { select: { firstName: true, lastName: true } },
      },
    }),
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

  const targetMap = await enrichTargets(allTargetIds);

  const statusCounts = Object.fromEntries(
    statusGroups.map((g) => [g.status, g._count._all]),
  );

  let items = reports.map((r) => toItem(r, targetMap));

  if (sortBy === "most_reported") {
    items.sort(
      (a, b) =>
        b.targetReportCount - a.targetReportCount ||
        new Date(b.reportedAt) - new Date(a.reportedAt),
    );
  }

  const topReported = targetGroups
    .filter((g) => g._count._all > 1)
    .map((g) => ({
      targetId: g.targetId,
      count: g._count._all,
      targetName: targetMap[g.targetId]?.name || null,
      targetShopName: targetMap[g.targetId]?.shopName || null,
    }));

  const highRiskTargets = topReported.filter(
    (t) => t.count >= DEFAULT_ANOMALY_THRESHOLD,
  );

  return {
    items,
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
