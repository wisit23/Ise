import { executiveFetch as apiFetch } from "./executiveRequest";
import {
  MAX_RANGE_DAYS,
  TIMEZONE,
  addDays,
  dayRangeError,
  defaultCustomDay,
} from "./executive";
import {
  parseComplaintResponse,
  REPORT_STATUS_LABELS,
} from "./executiveComplaints";
import { DISPUTE_TYPES, DECISION_LABELS } from "./disputePresentation";
import {
  DISPUTE_STATUS_LABEL,
  DISPUTE_STATUS_STYLE,
  PRIORITY_LABEL,
  TICKET_STATUS_LABEL,
  TICKET_STATUS_STYLE,
} from "./supportConstants";

/**
 * The Executive complaints page lists three kinds of case, each owned by its
 * own service: complaints about a user or product (auth-service), support
 * tickets (support-service) and order disputes (order-service). They do not
 * share a status list, a category or a priority, so the page offers only the
 * filters that kind has (CEO-DEC-014) and reads each through its own API.
 */

export const INBOX_SOURCES = {
  report: {
    value: "report",
    label: "ข้อร้องเรียน",
    path: "/api/auth/executive/reports",
    filters: ["status"],
  },
  ticket: {
    value: "ticket",
    label: "Ticket",
    path: "/api/support/executive/tickets",
    filters: ["status", "category", "priority"],
  },
  dispute: {
    value: "dispute",
    label: "ข้อพิพาท",
    path: "/api/orders/executive/disputes",
    filters: ["status", "type", "priority"],
  },
};

/** The "what to look at" choices: everything, or one kind. */
export const INBOX_SOURCE_CHOICES = [
  { value: "all", label: "ทั้งหมด" },
  ...Object.values(INBOX_SOURCES).map(({ value, label }) => ({ value, label })),
];

/** Filters the page shows for a choice; "all" only has the period. */
export function filtersFor(source) {
  return INBOX_SOURCES[source]?.filters ?? [];
}

export const FILTER_LABELS = {
  status: "สถานะ",
  category: "หมวดหมู่",
  type: "ประเภทข้อพิพาท",
  priority: "ความเร่งด่วน",
};

export const INBOX_PERIODS = [
  { value: "today", label: "วันนี้", days: 1 },
  { value: "7d", label: "7 วัน", days: 7 },
  { value: "15d", label: "15 วัน", days: 15 },
  { value: "30d", label: "30 วัน", days: 30 },
  { value: "custom", label: "กำหนดเอง" },
];

/** The longest custom range, in days (the same as the overview's). */
export const MAX_INBOX_DAYS = MAX_RANGE_DAYS;

// Case priorities in Thai. CRITICAL is only ever on an escalated dispute.
export const PRIORITY_NAMES = { ...PRIORITY_LABEL, CRITICAL: "วิกฤต" };

/** Why a custom range cannot be used, in Thai, or "" when it can. */
export const inboxRangeError = dayRangeError;

/** The window for a period as local dates with an exclusive end, which the
 * services read as midnight in the report time zone. */
export function inboxRange(period, custom, instant = new Date()) {
  if (period === "custom") {
    return { from: custom.from, to: addDays(custom.to, 1) };
  }
  const days = INBOX_PERIODS.find((p) => p.value === period)?.days ?? 1;
  const today = defaultCustomDay(instant);
  return { from: addDays(today, -(days - 1)), to: addDays(today, 1) };
}

/** What the person picked, with nothing chosen. `q` is the reference search. */
export const EMPTY_FILTERS = {
  status: "",
  category: "",
  type: "",
  priority: "",
  q: "",
  // Who the complaints are about; set by opening a high-risk target.
  targetId: "",
};

// The longest search the services take (they refuse more).
export const MAX_SEARCH_LENGTH = 100;

/** The search text as it is sent: trimmed, "" when empty. It is a reference
 * code (whole or in part), a ticket number or a shop's name; each service
 * matches it as plain text, whatever its characters. */
export function cleanSearch(text) {
  return String(text ?? "")
    .trim()
    .slice(0, MAX_SEARCH_LENGTH);
}

// The query name each filter has in each service's API.
const QUERY_NAMES = { dispute: { type: "disputeType" } };

/** How the list is ordered, by when each case was opened. */
export const INBOX_SORTS = [
  { value: "newest", label: "วันล่าสุด" },
  { value: "oldest", label: "วันเก่าสุด" },
];
export const DEFAULT_SORT = "newest";

export const INBOX_PAGE_SIZE = 20;
// Reading "all" takes the newest cases of each kind, up to what one request
// may return, and merges them; the page says when that is not everything.
export const MERGED_PER_SOURCE = 50;

export function buildInboxPath(
  source,
  range,
  filters,
  page,
  limit,
  sort = DEFAULT_SORT,
) {
  const { path } = INBOX_SOURCES[source];
  const query = new URLSearchParams({
    timezone: TIMEZONE,
    page: String(page),
    limit: String(limit),
  });
  // A target's complaints are listed whenever they were reported, because the
  // warning counts them over all time; every other list follows the period.
  const wholeHistory = source === "report" && Boolean(filters.targetId);
  if (wholeHistory) {
    query.set("targetId", filters.targetId);
  } else {
    query.set("from", range.from);
    query.set("to", range.to);
  }
  query.set("sort", sort);
  // Each kind finds its own codes: RPT-/USR-, TKT-/ticket number, DSP-/ORD-.
  if (filters.q) query.set("q", filters.q);
  if (source === "report") {
    // Complaints default to the open queue; this page lists every status.
    query.set("status", filters.status || "ALL");
  } else {
    for (const name of INBOX_SOURCES[source].filters) {
      if (filters[name]) {
        query.set(QUERY_NAMES[source]?.[name] ?? name, filters[name]);
      }
    }
  }
  return `${path}?${query.toString()}`;
}

const isCount = (value) => Number.isInteger(value) && value >= 0;

function invalid() {
  return new Error("ข้อมูลจากระบบไม่ถูกต้อง");
}

/** The shared envelope of the ticket and dispute lists, or throws. */
function parseListResponse(response) {
  const ok =
    response &&
    Array.isArray(response.items) &&
    isCount(response.total) &&
    isCount(response.page) &&
    isCount(response.totalPages) &&
    response.statusCounts &&
    typeof response.statusCounts === "object" &&
    Object.values(response.statusCounts).every(isCount) &&
    response.options &&
    typeof response.options === "object";
  if (!ok) throw invalid();
  return response;
}

const dateOf = (value) => new Date(value).getTime();

function reportItem(report) {
  return {
    key: `report:${report.id}`,
    source: "report",
    id: report.id,
    createdAt: report.reportedAt,
    report,
  };
}

function ticketItem(ticket) {
  return {
    key: `ticket:${ticket.id}`,
    source: "ticket",
    id: ticket.id,
    createdAt: ticket.createdAt,
    title: ticket.subject,
    reference: ticket.referenceCode || ticket.ticketNumber,
    status: {
      code: ticket.status.code,
      label: TICKET_STATUS_LABEL[ticket.status.code] || ticket.status.name,
      style: TICKET_STATUS_STYLE[ticket.status.code],
    },
    tags: [
      ticket.category.name,
      PRIORITY_NAMES[ticket.priority.code] || ticket.priority.name,
    ],
  };
}

export const DISPUTE_TYPE_NAMES = Object.fromEntries(DISPUTE_TYPES);

function disputeItem(dispute) {
  return {
    key: `dispute:${dispute.id}`,
    source: "dispute",
    id: dispute.id,
    createdAt: dispute.createdAt,
    title: dispute.reason,
    reference: dispute.referenceCode || dispute.orderId,
    status: {
      code: dispute.status,
      label: DISPUTE_STATUS_LABEL[dispute.status] || dispute.status,
      style: DISPUTE_STATUS_STYLE[dispute.status],
    },
    tags: [
      DISPUTE_TYPE_NAMES[dispute.disputeType] || dispute.disputeType,
      PRIORITY_NAMES[dispute.priority] || dispute.priority,
      ...(dispute.decision && DECISION_LABELS[dispute.decision]
        ? [DECISION_LABELS[dispute.decision]]
        : []),
    ],
  };
}

/** The choices a filter offers, as [{value,label}] with "everything" first. */
export function filterOptions(source, options = {}) {
  const all = { value: "", label: "ทั้งหมด" };
  const named = (list, labels) =>
    (list || []).map((entry) => {
      const code = typeof entry === "string" ? entry : entry.code;
      const fallback = typeof entry === "string" ? entry : entry.name;
      return { value: code, label: labels?.[code] || fallback };
    });
  if (source === "report") {
    return {
      status: [
        all,
        ...Object.entries(REPORT_STATUS_LABELS).map(([value, label]) => ({
          value,
          label,
        })),
      ],
    };
  }
  if (source === "ticket") {
    return {
      status: [all, ...named(options.statuses, TICKET_STATUS_LABEL)],
      category: [all, ...named(options.categories)],
      priority: [all, ...named(options.priorities, PRIORITY_NAMES)],
    };
  }
  if (source === "dispute") {
    return {
      status: [all, ...named(options.statuses, DISPUTE_STATUS_LABEL)],
      type: [
        all,
        ...(options.types || []).map((code) => ({
          value: code,
          label: DISPUTE_TYPE_NAMES[code] || code,
        })),
      ],
      priority: [all, ...named(options.priorities, PRIORITY_NAMES)],
    };
  }
  return {};
}

/** How many cases each status has, as [{code,label,count}] for the chips. */
export function statusSummary(source, statusCounts = {}, options = {}) {
  const labels =
    source === "report"
      ? REPORT_STATUS_LABELS
      : source === "dispute"
        ? DISPUTE_STATUS_LABEL
        : TICKET_STATUS_LABEL;
  const codes =
    source === "report"
      ? Object.keys(REPORT_STATUS_LABELS)
      : (options.statuses || []).map((s) =>
          typeof s === "string" ? s : s.code,
        );
  return codes.map((code) => ({
    code,
    label: labels[code] || code,
    count: statusCounts[code] ?? 0,
  }));
}

/** One kind's answer for the window, or { ok: false } when its service did not
 * give a usable one (an outage is shown as such, never as an empty list). */
async function fetchSource(source, range, filters, page, limit, sort, token) {
  try {
    const response = await apiFetch(
      buildInboxPath(source, range, filters, page, limit, sort),
      { token },
    );
    if (source === "report") {
      const data = parseComplaintResponse(response);
      return {
        ok: true,
        source,
        items: data.items.map(reportItem),
        total: data.total ?? data.items.length,
        totalPages: data.totalPages ?? 1,
        statusCounts: data.statusCounts,
        options: {},
        anomalySummary: data.anomalySummary,
      };
    }
    const data = parseListResponse(response);
    const toItem = source === "ticket" ? ticketItem : disputeItem;
    return {
      ok: true,
      source,
      items: data.items.map(toItem),
      total: data.total,
      totalPages: data.totalPages,
      statusCounts: data.statusCounts,
      options: data.options,
      anomalySummary: null,
    };
  } catch {
    return { ok: false, source };
  }
}

/**
 * The cases for the chosen kind and window. One kind is read page by page;
 * "all" takes the newest of each kind, merges them newest first and says in
 * `truncated` when a kind has more than was taken. A kind that fails comes
 * back in `failed` so the others still show.
 */
export async function fetchInbox({
  source,
  range,
  filters,
  page,
  sort = DEFAULT_SORT,
  token,
}) {
  if (source !== "all") {
    const result = await fetchSource(
      source,
      range,
      filters,
      page,
      INBOX_PAGE_SIZE,
      sort,
      token,
    );
    if (!result.ok) {
      return {
        results: {},
        items: [],
        total: 0,
        totalPages: 1,
        truncated: false,
        failed: [source],
      };
    }
    return {
      results: { [source]: result },
      items: result.items,
      total: result.total,
      totalPages: result.totalPages,
      truncated: false,
      failed: [],
    };
  }

  const kinds = Object.keys(INBOX_SOURCES);
  const answers = await Promise.all(
    kinds.map((kind) =>
      fetchSource(
        kind,
        range,
        { ...EMPTY_FILTERS, q: filters.q },
        1,
        MERGED_PER_SOURCE,
        sort,
        token,
      ),
    ),
  );
  const good = answers.filter((a) => a.ok);
  const items = good
    .flatMap((a) => a.items)
    .sort(
      (a, b) =>
        (sort === "oldest"
          ? dateOf(a.createdAt) - dateOf(b.createdAt)
          : dateOf(b.createdAt) - dateOf(a.createdAt)) ||
        (a.key < b.key ? -1 : 1),
    );
  return {
    results: Object.fromEntries(good.map((a) => [a.source, a])),
    items,
    total: good.reduce((sum, a) => sum + a.total, 0),
    totalPages: Math.max(1, Math.ceil(items.length / INBOX_PAGE_SIZE)),
    truncated: good.some((a) => a.total > a.items.length),
    failed: answers.filter((a) => !a.ok).map((a) => a.source),
  };
}
