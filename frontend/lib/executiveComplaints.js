// @ts-check
import { LOCALE, TIMEZONE } from "./executive";
import { SAFETY_ACTION_LABEL } from "./supportConstants";

/**
 * @typedef {Object} ReportActionDetails
 * @property {string} actorId
 * @property {string|null} actorName
 * @property {string} reason
 *
 * @typedef {Object} ExecutiveReport
 * @property {string} id
 * @property {string|null} [referenceCode]
 * @property {string} reason
 * @property {'OPEN'|'REVIEWED'|'ACTIONED'|'DISMISSED'} status
 * @property {string} reportedAt
 * @property {string|null} actionTaken
 * @property {ReportActionDetails|null} actionDetails
 * @property {string|null} reporterName
 * @property {string|null} targetId
 * @property {string|null} [targetReferenceCode]
 * @property {string|null} targetName
 * @property {string|null} targetShopName
 * @property {string|null} productId
 * @property {string|null} [productTitle]
 * @property {boolean} [productDeleted]
 * @property {boolean} [productUnavailable]
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
    ...(value.referenceCode
      ? { referenceCode: optionalText(value.referenceCode) }
      : {}),
    reason: value.reason,
    status: /** @type {ExecutiveReport['status']} */ (value.status),
    reportedAt: value.reportedAt,
    actionTaken: optionalText(value.actionTaken),
    reporterName: optionalText(value.reporterName),
    targetId: optionalText(value.targetId),
    ...(value.targetReferenceCode
      ? { targetReferenceCode: optionalText(value.targetReferenceCode) }
      : {}),
    targetName: optionalText(value.targetName),
    targetShopName: optionalText(value.targetShopName),
    productId: optionalText(value.productId),
    // The product's name, from product-service; absent when no product.
    ...(value.productTitle !== undefined
      ? { productTitle: optionalText(value.productTitle) }
      : {}),
    // Sold products keep their name; a deleted one has it too, flagged.
    ...(value.productDeleted === true ? { productDeleted: true } : {}),
    ...(value.productUnavailable === true ? { productUnavailable: true } : {}),
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
  return new Date(value).toLocaleString(LOCALE, {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// How a seller's report of a customer's review is written into `reason` by
// auth-service: "[รายงานรีวิว #<id>] [<topic>] <comment> (เนื้อหารีวิว: "<review>")".
const REVIEW_REPORT = /^\s*\[รายงานรีวิว\s*#?[^\]]*\]\s*([\s\S]*)$/;
const REVIEW_TOPIC = /^\[([^\]]+)\]\s*([\s\S]*)$/;
const REVIEW_CONTENT = /\s*\(เนื้อหารีวิว:\s*([\s\S]*)\)\s*$/;
const QUOTES = /^["“”']+|["“”']+$/g;

/**
 * What a complaint is about. Reports of a review are kept in the same table as
 * reports of a user and are told apart only by the marker at the start of the
 * reason, so this reads it: the topic the seller picked, what they added, and
 * the review as it was. Any other report is returned as it is.
 *
 * @param {Pick<ExecutiveReport, 'reason'>} report
 * @returns {{kind: 'review', topic: string|null, comment: string, reviewText: string|null}
 *   | {kind: 'user', comment: string}}
 */
export function describeReport(report) {
  const reason = String(report?.reason ?? "");
  const review = REVIEW_REPORT.exec(reason);
  if (!review) return { kind: "user", comment: reason };

  let rest = review[1];
  let reviewText = null;
  const content = REVIEW_CONTENT.exec(rest);
  if (content) {
    reviewText = content[1].replace(QUOTES, "").trim() || null;
    rest = rest.slice(0, content.index);
  }
  let topic = null;
  const withTopic = REVIEW_TOPIC.exec(rest.trim());
  if (withTopic) {
    topic = withTopic[1].trim();
    rest = withTopic[2];
  }
  return { kind: "review", topic, comment: rest.trim(), reviewText };
}

/**
 * Who a complaint is about, as the page names them. For a review it is the
 * person who wrote it, by name; their shop, if they also run one, is not who
 * was reported. For anything else it is the shop, else the person.
 *
 * @param {ExecutiveReport} report
 */
export function reportedPartyName(report) {
  if (describeReport(report).kind === "review") {
    return report.targetName || report.targetShopName || null;
  }
  return report.targetShopName || report.targetName || null;
}

/** @param {ExecutiveReport} report */
export function actionLabel(report) {
  if (!["ACTIONED", "DISMISSED"].includes(report.status)) return "-";
  // UI translations of persisted domain codes, not fabricated decision data.
  /** @type {Record<string, string>} */
  const labels = {
    ...SAFETY_ACTION_LABEL,
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
