const prisma = require("../../models/prismaClient");

/**
 * Complaint / abnormal-activity feed for the Executive dashboard.
 *
 * There is no anomaly-detection store yet (CEO-004 is Extended scope), so
 * this reads the `reports` table auth-service already owns — user-submitted
 * complaints are the only real "something looks wrong here" signal that
 * exists today. When a transaction-anomaly source lands later it can be
 * merged into the same response shape without changing the UI.
 */

const OPEN_STATUSES = ["OPEN", "REVIEWED"];

function toItem(report) {
  return {
    id: report.id,
    reason: report.reason,
    status: report.status,
    reportedAt: report.reportedAt.toISOString(),
    targetId: report.targetId,
    productId: report.productId,
    reporterName: report.reporter
      ? `${report.reporter.firstName} ${report.reporter.lastName}`.trim()
      : null,
  };
}

/**
 * `topReported` answers the "ธุรกรรมที่มีข้อร้องเรียนจำนวนมาก" half of the
 * requirement: the same target reported repeatedly matters more than one
 * isolated complaint, so it is surfaced separately from the flat list rather
 * than leaving the executive to eyeball duplicates.
 */
async function getReportOverview({ status, limit = 20 }) {
  const where = status ? { status } : { status: { in: OPEN_STATUSES } };

  const [reports, statusGroups, targetGroups] = await Promise.all([
    prisma.report.findMany({
      where,
      orderBy: { reportedAt: "desc" },
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
      take: 5,
    }),
  ]);

  const statusCounts = Object.fromEntries(
    statusGroups.map((g) => [g.status, g._count._all]),
  );

  return {
    items: reports.map(toItem),
    statusCounts,
    totalOpen: (statusCounts.OPEN || 0) + (statusCounts.REVIEWED || 0),
    topReported: targetGroups
      .filter((g) => g._count._all > 1)
      .map((g) => ({ targetId: g.targetId, count: g._count._all })),
  };
}

module.exports = { getReportOverview, OPEN_STATUSES };
