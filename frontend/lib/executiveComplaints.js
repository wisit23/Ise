// @ts-check
import { TIMEZONE } from "./executive";

/**
 * @typedef {Object} ReportActionDetails
 * @property {string} actorId
 * @property {string|null} actorName
 * @property {string} reason
 *
 * @typedef {Object} ExecutiveReport
 * @property {string} id
 * @property {string} reason
 * @property {'OPEN'|'REVIEWED'|'ACTIONED'|'DISMISSED'} status
 * @property {string} reportedAt
 * @property {string|null} actionTaken
 * @property {ReportActionDetails|null} actionDetails
 * @property {string|null} reporterName
 * @property {string|null} targetId
 * @property {string|null} targetName
 * @property {string|null} targetShopName
 * @property {string|null} productId
 * @property {number|undefined} targetReportCount
 *
 * @typedef {Object} RiskTarget
 * @property {string} targetId
 * @property {number} count
 * @property {string|null} targetName
 * @property {string|null} targetShopName
 *
 * @typedef {Object} ExecutiveComplaintData
 * @property {ExecutiveReport[]} items
 * @property {Record<string, number>} statusCounts
 * @property {number} totalOpen
 * @property {{detected: boolean, threshold: number, highRiskTargets: RiskTarget[]}|null} anomalySummary
 * @property {number|undefined} total
 * @property {number|undefined} page
 * @property {number|undefined} limit
 * @property {number|undefined} totalPages
 */

export const REPORT_STATUS_LABELS = {
  OPEN: "ยังไม่ตรวจสอบ",
  REVIEWED: "กำลังตรวจสอบ",
  ACTIONED: "ดำเนินการแล้ว",
  DISMISSED: "ยกคำร้อง",
};

function invalidResponse() {
  return new Error("ข้อมูลข้อร้องเรียนจากระบบไม่ถูกต้อง กรุณาลองใหม่");
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** @param {unknown} value @returns {string|null} */
function optionalText(value) {
  if (value == null) return null;
  if (typeof value !== "string") throw invalidResponse();
  return value;
}

/** @param {unknown} value @returns {value is number} */
function isCount(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** @param {unknown} value @returns {number|undefined} */
function optionalCount(value) {
  if (value === undefined) return undefined;
  if (!isCount(value)) throw invalidResponse();
  return value;
}

/** @param {unknown} value @returns {ExecutiveReport} */
function parseReport(value) {
  if (
    !isObject(value) ||
    typeof value.id !== "string" ||
    !value.id ||
    typeof value.reason !== "string" ||
    typeof value.status !== "string" ||
    !Object.hasOwn(REPORT_STATUS_LABELS, value.status) ||
    typeof value.reportedAt !== "string" ||
    Number.isNaN(new Date(value.reportedAt).getTime())
  )
    throw invalidResponse();

  /** @type {ExecutiveReport} */
  const report = {
    id: value.id,
    reason: value.reason,
    status: /** @type {ExecutiveReport['status']} */ (value.status),
    reportedAt: value.reportedAt,
    actionTaken: optionalText(value.actionTaken),
    reporterName: optionalText(value.reporterName),
    targetId: optionalText(value.targetId),
    targetName: optionalText(value.targetName),
    targetShopName: optionalText(value.targetShopName),
    productId: optionalText(value.productId),
    targetReportCount: optionalCount(value.targetReportCount),
    actionDetails: null,
  };
  if (value.actionDetails != null) {
    const details = value.actionDetails;
    if (
      !isObject(details) ||
      typeof details.actorId !== "string" ||
      !details.actorId ||
      typeof details.reason !== "string"
    )
      throw invalidResponse();
    const actorName = optionalText(details.actorName);
    if (["ACTIONED", "DISMISSED"].includes(report.status)) {
      report.actionDetails = {
        actorId: details.actorId,
        actorName,
        reason: details.reason,
      };
    }
  }
  if (!["ACTIONED", "DISMISSED"].includes(report.status))
    report.actionTaken = null;
  return report;
}

/** @param {unknown} response @returns {ExecutiveComplaintData} */
export function parseComplaintResponse(response) {
  if (!isObject(response)) throw invalidResponse();
  const data = response.data;
  if (
    !isObject(data) ||
    !Array.isArray(data.items) ||
    !isObject(data.statusCounts) ||
    !isCount(data.totalOpen) ||
    !Object.values(data.statusCounts).every(isCount)
  )
    throw invalidResponse();

  const total = optionalCount(data.total);
  const page = optionalCount(data.page);
  const limit = optionalCount(data.limit);
  const totalPages = optionalCount(data.totalPages);
  const pagination = [total, page, limit, totalPages];
  if (pagination.some((value) => value !== undefined)) {
    if (
      total === undefined ||
      page === undefined ||
      limit === undefined ||
      totalPages === undefined ||
      page < 1 ||
      limit < 1 ||
      totalPages !== Math.ceil(total / limit) ||
      data.items.length > limit
    )
      throw invalidResponse();
  }

  /** @type {ExecutiveComplaintData['anomalySummary']} */
  let anomalySummary = null;
  if (data.anomalySummary != null) {
    const summary = data.anomalySummary;
    if (
      !isObject(summary) ||
      typeof summary.detected !== "boolean" ||
      !isCount(summary.threshold) ||
      summary.threshold < 1 ||
      !Array.isArray(summary.highRiskTargets)
    )
      throw invalidResponse();
    const highRiskTargets = summary.highRiskTargets.map((target) => {
      if (
        !isObject(target) ||
        typeof target.targetId !== "string" ||
        !target.targetId ||
        !isCount(target.count)
      )
        throw invalidResponse();
      return {
        targetId: target.targetId,
        count: target.count,
        targetName: optionalText(target.targetName),
        targetShopName: optionalText(target.targetShopName),
      };
    });
    anomalySummary = {
      detected: summary.detected,
      threshold: summary.threshold,
      highRiskTargets,
    };
  }
  return {
    items: data.items.map(parseReport),
    statusCounts: Object.fromEntries(
      Object.entries(data.statusCounts).map(([key, value]) => [
        key,
        Number(value),
      ]),
    ),
    totalOpen: data.totalOpen,
    anomalySummary,
    total,
    page,
    limit,
    totalPages,
  };
}

/** @param {string} value */
export function formatReportedAt(value) {
  return new Date(value).toLocaleString("th-TH", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** @param {ExecutiveReport} report */
export function actionLabel(report) {
  if (!["ACTIONED", "DISMISSED"].includes(report.status)) return "-";
  // UI translations of persisted domain codes, not fabricated decision data.
  /** @type {Record<string, string>} */
  const labels = {
    WARN_USER: report.targetShopName ? "เตือนร้านค้า" : "เตือนผู้ใช้",
    DISMISS: "ไม่ดำเนินการ",
    SUSPEND_USER: "ระงับบัญชีผู้ใช้",
    REMOVE_PRODUCT: "นำสินค้าออก",
  };
  if (!report.actionTaken) return "-";
  return Object.hasOwn(labels, report.actionTaken)
    ? labels[report.actionTaken]
    : "ไม่ทราบการดำเนินการ";
}
