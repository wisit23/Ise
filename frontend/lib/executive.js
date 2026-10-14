import { apiFetch } from "./api";

export const TIMEZONE =
  process.env.NEXT_PUBLIC_REPORT_TIMEZONE || "Asia/Bangkok";

/** Platform fee assumption. There is no payment system yet, so revenue is
 * modelled as a flat 3% of GMV — the same rate order-service applies when it
 * computes `platformRevenue`, kept here only for labelling the report. */
export const PLATFORM_FEE_RATE = 0.03;

export const MONTH_NAMES = [
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

export function baht(v) {
  return `฿${v.toLocaleString("th-TH")}`;
}

/** Calendar year and month of `instant` in the report time zone — "this
 * month" for a Bangkok executive changes at Bangkok midnight, not UTC's. */
export function currentYearMonth(instant = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TIMEZONE,
      year: "numeric",
      month: "numeric",
    })
      .formatToParts(instant)
      .map(({ type, value }) => [type, value]),
  );
  return { year: Number(parts.year), monthIndex: Number(parts.month) - 1 };
}

/** "YYYY-MM-DD" for a calendar date; month/day overflow rolls like Date.UTC. */
function isoDate(year, monthIndex, day) {
  return new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10);
}

/** Calendar month [from, to) as local dates, plus a short display label.
 * The backend reads date-only bounds as midnight in TIMEZONE. */
export function monthWindow(year, monthIndex) {
  const start = new Date(Date.UTC(year, monthIndex, 1));
  return {
    from: isoDate(year, monthIndex, 1),
    to: isoDate(year, monthIndex + 1, 1),
    // A calendar label, not an instant, so it is formatted in UTC on purpose.
    label: start.toLocaleDateString("th-TH", {
      month: "short",
      year: "2-digit",
      timeZone: "UTC",
    }),
    longLabel: `${MONTH_NAMES[start.getUTCMonth()]} ${start.getUTCFullYear() + 543}`,
  };
}

export function yearWindow(year) {
  return {
    from: isoDate(year, 0, 1),
    to: isoDate(year + 1, 0, 1),
    label: String(year),
    longLabel: `ปี ${year + 543}`,
  };
}

/** N most recent windows ending with the current one, oldest first. */
export function lastNWindows(granularity, n, instant = new Date()) {
  const now = currentYearMonth(instant);
  const windows = [];
  for (let i = n - 1; i >= 0; i--) {
    windows.push(
      granularity === "year"
        ? yearWindow(now.year - i)
        : monthWindow(now.year, now.monthIndex - i),
    );
  }
  return windows;
}

export function buildPath(base, win) {
  const q = new URLSearchParams({
    from: win.from,
    to: win.to,
    timezone: TIMEZONE,
  });
  return `${base}?${q.toString()}`;
}

export function buildSeriesPath(base, win, granularity) {
  const q = new URLSearchParams({
    from: win.from,
    to: win.to,
    granularity,
    timezone: TIMEZONE,
  });
  return `${base}?${q.toString()}`;
}

/** "01/ส.ค./69" for one day-bucket ISO period. Periods are the instants at
 * which a TIMEZONE day begins, so they are read back in TIMEZONE.
 *
 * Month and year must be formatted in the same toLocaleDateString call: th-TH
 * spells out "พ.ศ. 69" when year is requested alone, but drops the era prefix
 * down to a bare "69" once month is formatted alongside it — so a separate
 * year-only call here would silently produce "01/ส.ค./พ.ศ. 69". */
export function dayLabel(isoPeriod) {
  const d = new Date(isoPeriod);
  const day = d.toLocaleDateString("en-US", {
    day: "2-digit",
    timeZone: TIMEZONE,
  });
  const monthYear = d.toLocaleDateString("th-TH", {
    month: "short",
    year: "2-digit",
    timeZone: TIMEZONE,
  });
  return `${day}/${monthYear.replace(" ", "/")}`;
}

/** Full Thai month name for one month-bucket ISO period. */
export function monthLabel(isoPeriod) {
  return MONTH_NAMES[currentYearMonth(new Date(isoPeriod)).monthIndex];
}

/** Unwraps one Promise.allSettled entry; null means that provider failed and
 * the caller must render "unavailable" rather than substituting a zero. */
export function fulfilled(settled) {
  return settled?.status === "fulfilled" ? settled.value : null;
}

/**
 * Percent change, or null when it cannot be stated honestly:
 * a missing figure on either side, or a zero baseline (growth from 0 is
 * undefined, not "infinite" and not "100%").
 */
export function growthPct(current, previous) {
  if (current === null || current === undefined) return null;
  if (previous === null || previous === undefined) return null;
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export const PROVIDERS = {
  auth: "/api/auth/executive/metrics",
  order: "/api/orders/executive/metrics",
  product: "/api/products/executive/metrics",
};

/** Fetches all three owner-local providers for one window in parallel.
 * Never rejects: a failed provider comes back as null (CEO-DEC-003). */
export async function fetchWindowMetrics(win, token) {
  const results = await Promise.allSettled([
    apiFetch(buildPath(PROVIDERS.auth, win), { token }),
    apiFetch(buildPath(PROVIDERS.order, win), { token }),
    apiFetch(buildPath(PROVIDERS.product, win), { token }),
  ]);
  return {
    auth: fulfilled(results[0]),
    order: fulfilled(results[1]),
    product: fulfilled(results[2]),
  };
}

export const SERIES_PROVIDERS = {
  auth: "/api/auth/executive/metrics-series",
  order: "/api/orders/executive/metrics-series",
};

/** Fetches the order + auth day/month breakdown for one window in parallel.
 * Never rejects: a failed provider comes back as null so the caller can
 * render "ไม่พร้อมใช้งาน" for that whole column instead of a fake zero. */
export async function fetchMetricsSeries(win, granularity, token) {
  const results = await Promise.allSettled([
    apiFetch(buildSeriesPath(SERIES_PROVIDERS.order, win, granularity), {
      token,
    }),
    apiFetch(buildSeriesPath(SERIES_PROVIDERS.auth, win, granularity), {
      token,
    }),
  ]);
  return {
    order: fulfilled(results[0])?.data ?? null,
    auth: fulfilled(results[1])?.data ?? null,
  };
}

/** Records an append-only executive audit log entry (e.g. on export CSV or moderation). */
export async function logExecutiveAction(actionData, token) {
  try {
    return await apiFetch("/api/auth/executive/audit", {
      token,
      method: "POST",
      body: actionData,
    });
  } catch (err) {
    console.warn("Failed to record executive audit log:", err);
    return null;
  }
}

/** Queries executive audit logs with pagination and filters. */
export async function fetchExecutiveAuditLogs(params = {}, token) {
  const query = new URLSearchParams(params).toString();
  const path = `/api/auth/executive/audit${query ? `?${query}` : ""}`;
  return apiFetch(path, { token });
}
