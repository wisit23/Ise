const { badRequest } = require("@reloop/shared");

// What the browser may ask the server to record. The server owns the meaning
// of an entry: the action must be on this list, the category and the wording
// come from here, and only the listed metadata keys survive. A client can no
// longer write an entry for something that never happened or invent its own
// action names.
const MONTH_NAMES = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

const integer = (min, max) => (value) =>
  Number.isInteger(value) && value >= min && value <= max ? value : undefined;
const oneOf =
  (...allowed) =>
  (value) =>
    allowed.includes(value) ? value : undefined;

const ACTIONS = {
  REPORT_EXPORT_CSV: {
    category: "DATA_EXPORT",
    targetType: "report",
    metadata: {
      granularity: oneOf("month", "year"),
      year: integer(2000, 2200),
      monthIndex: integer(0, 11),
      rowCount: integer(0, 100000),
    },
    describe: ({ granularity, year, monthIndex }) => {
      const buddhistYear = Number.isInteger(year) ? year + 543 : null;
      if (granularity === "year" && buddhistYear) {
        return `ส่งออกรายงานยอดขายและรายได้ (ปี ${buddhistYear})`;
      }
      if (granularity === "month" && buddhistYear && MONTH_NAMES[monthIndex]) {
        return `ส่งออกรายงานยอดขายและรายได้ (เดือน ${MONTH_NAMES[monthIndex]} ${buddhistYear})`;
      }
      return "ส่งออกรายงานยอดขายและรายได้";
    },
  },
};

const TARGET_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/;

/**
 * Turns a client request into the entry the server is willing to record, or
 * throws a 400. Anything not listed above is dropped or rejected, never
 * passed through.
 */
function buildAuditEntry(body) {
  const input = body && typeof body === "object" ? body : {};
  const rule = Object.hasOwn(ACTIONS, input.action)
    ? ACTIONS[input.action]
    : null;
  if (!rule) {
    throw badRequest("Unknown audit action");
  }

  const metadata = {};
  const given =
    input.metadata && typeof input.metadata === "object" ? input.metadata : {};
  for (const [key, check] of Object.entries(rule.metadata)) {
    if (given[key] === undefined) continue;
    const value = check(given[key]);
    if (value === undefined) {
      throw badRequest(`Invalid audit metadata: ${key}`);
    }
    metadata[key] = value;
  }

  let targetId = null;
  if (input.targetId !== undefined && input.targetId !== null) {
    if (typeof input.targetId !== "string" || !TARGET_ID.test(input.targetId)) {
      throw badRequest("Invalid audit targetId");
    }
    targetId = input.targetId;
  }

  return {
    action: input.action,
    category: rule.category,
    targetType: rule.targetType,
    targetId,
    description: rule.describe(metadata),
    metadata: Object.keys(metadata).length > 0 ? metadata : null,
  };
}

module.exports = { ACTIONS, buildAuditEntry };
