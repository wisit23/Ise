import { executiveFetch as apiFetch } from "./executiveRequest";

/**
 * Details of one ticket or dispute for the Executive dialog, read through the
 * gateway from the service that owns it. Names come back with each person
 * (id + name); `meta` says when a name or a product title could not be looked
 * up, so the dialog shows "ไม่พร้อมใช้งาน" rather than a blank (CEO-DEC-015).
 */

const DETAIL_PATHS = {
  ticket: (id) => `/api/support/executive/tickets/${encodeURIComponent(id)}`,
  dispute: (id) => `/api/orders/executive/disputes/${encodeURIComponent(id)}`,
};

/** Whether a kind of case has a details dialog of its own here. */
export function hasCaseDetail(source) {
  return Object.hasOwn(DETAIL_PATHS, source);
}

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function invalid() {
  return new Error("ข้อมูลรายละเอียดจากระบบไม่ถูกต้อง");
}

/** { data, meta } for one case, or throws when the answer is not usable. */
export async function fetchCaseDetail(source, id, token) {
  const response = await apiFetch(DETAIL_PATHS[source](id), { token });
  if (!isObject(response) || !isObject(response.data)) throw invalid();
  const meta = isObject(response.meta) ? response.meta : {};
  if (source === "ticket" && !("handling" in response.data)) {
    throw invalid();
  }
  return { data: response.data, meta };
}

/**
 * How a person reads in the dialog: their name, or why there is none. A name
 * the directory could not give (auth-service down) is not the same as a person
 * it does not know.
 */
export function personLabel(person, namesAvailable) {
  if (!person) return "-";
  if (person.name) return person.name;
  return namesAvailable === false ? "ไม่พร้อมใช้งาน" : "ไม่ทราบชื่อ";
}

/** Whether a dispute that is still open has passed the time it had to be
 * decided by. */
export function isOverdue(detail, instant = new Date()) {
  if (detail.decision || !detail.decisionDueAt) return false;
  return new Date(detail.decisionDueAt).getTime() < instant.getTime();
}
