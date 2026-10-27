// @ts-check
import { executiveFetch as apiFetch } from "./executiveRequest";

/**
 * Details of one ticket or dispute for the Executive dialog, read through the
 * gateway from the service that owns it. Names come back with each person
 * (id + name); `meta` says when a name or a product title could not be looked
 * up, so the dialog shows "ไม่พร้อมใช้งาน" rather than a blank (CEO-DEC-015).
 */

const DETAIL_PATHS = {
  /** @param {string} id */
  ticket: (id) => `/api/support/executive/tickets/${encodeURIComponent(id)}`,
  /** @param {string} id */
  dispute: (id) => `/api/orders/executive/disputes/${encodeURIComponent(id)}`,
};

/** @param {unknown} source @returns {source is keyof typeof DETAIL_PATHS} */
export function hasCaseDetail(source) {
  return typeof source === "string" && Object.hasOwn(DETAIL_PATHS, source);
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** @param {unknown} value @returns {value is string} */
const isText = (value) => typeof value === "string" && value.trim().length > 0;
/** @param {unknown} value */
const optionalText = (value) => value == null || typeof value === "string";
/** @param {unknown} value */
const validDate = (value) =>
  isText(value) && Number.isFinite(Date.parse(value));
/** @param {unknown} value */
const optionalDate = (value) => value == null || validDate(value);
/** @param {unknown} value */
const validPerson = (value) =>
  value == null ||
  (isObject(value) &&
    isText(value.id) &&
    optionalText(value.name) &&
    (value.roles === undefined ||
      (Array.isArray(value.roles) && value.roles.every(isText))));
/** @param {unknown} value */
const validProduct = (value) =>
  value == null ||
  (isObject(value) && isText(value.id) && optionalText(value.title));

/** Reject malformed data before it can crash a dialog during rendering.
 * @param {'ticket'|'dispute'} source @param {Record<string, unknown>} data */
function validDetail(source, data) {
  if (
    !isText(data.id) ||
    !validDate(data.createdAt) ||
    !validProduct(data.product) ||
    !validPerson(data.assignee)
  )
    return false;
  if (source === "dispute") {
    return (
      [data.reason, data.status, data.disputeType, data.priority].every(
        isText,
      ) &&
      isObject(data.order) &&
      isText(data.order.id) &&
      (data.order.amount === null ||
        (typeof data.order.amount === "number" &&
          Number.isFinite(data.order.amount) &&
          data.order.amount >= 0)) &&
      optionalText(data.order.orderType) &&
      [data.buyer, data.seller, data.decider].every(validPerson) &&
      [data.assignedAt, data.decidedAt, data.decisionDueAt].every(
        optionalDate,
      ) &&
      [data.assignedRole, data.decision, data.decisionReason].every(
        optionalText,
      )
    );
  }
  const handling = data.handling;
  return (
    isText(data.subject) &&
    isText(data.ticketNumber) &&
    validPerson(data.requester) &&
    isObject(data.status) &&
    isText(data.status.code) &&
    isText(data.status.name) &&
    optionalText(data.orderId) &&
    (handling === null ||
      (isObject(handling) &&
        validPerson(handling.by) &&
        validDate(handling.at) &&
        isText(handling.outcome) &&
        optionalText(handling.reason)))
  );
}

function invalid() {
  return new Error("ข้อมูลรายละเอียดจากระบบไม่ถูกต้อง");
}

/** @param {string} source @param {string} id @param {string} token */
export async function fetchCaseDetail(source, id, token) {
  if (!hasCaseDetail(source) || !isText(id) || id.length > 200) throw invalid();
  const response = await apiFetch(DETAIL_PATHS[source](id), { token });
  if (!isObject(response) || !isObject(response.data)) throw invalid();
  const meta = isObject(response.meta) ? response.meta : {};
  if (
    response.data.id !== id ||
    !validDetail(source, response.data) ||
    [meta.namesAvailable, meta.productAvailable].some(
      (value) => value !== undefined && typeof value !== "boolean",
    )
  ) {
    throw invalid();
  }
  return { data: response.data, meta };
}

/**
 * How a person reads in the dialog: their name, or why there is none. A name
 * the directory could not give (auth-service down) is not the same as a person
 * it does not know.
 * @param {{name?: string|null}|null} person @param {boolean|undefined} namesAvailable
 */
export function personLabel(person, namesAvailable) {
  if (!person) return "-";
  if (person.name) return person.name;
  return namesAvailable === false ? "ไม่พร้อมใช้งาน" : "ไม่ทราบชื่อ";
}

/** @param {{decision?: string|null, decisionDueAt?: string|null}} detail @param {Date} instant */
export function isOverdue(detail, instant = new Date()) {
  if (detail.decision || !detail.decisionDueAt) return false;
  return new Date(detail.decisionDueAt).getTime() < instant.getTime();
}
