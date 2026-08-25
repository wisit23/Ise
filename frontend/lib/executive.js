import { apiFetch } from "./api";

export const TIMEZONE = "Asia/Bangkok";

/** Platform fee assumption. There is no payment system yet, so revenue is
 * modelled as a flat 10% of GMV — the same rate order-service applies when it
 * computes `platformRevenue`, kept here only for labelling the report. */
export const PLATFORM_FEE_RATE = 0.1;

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

/** Calendar month [from, to) in UTC, plus a short display label. */
export function monthWindow(year, monthIndex) {
  const from = new Date(Date.UTC(year, monthIndex, 1));
  const to = new Date(Date.UTC(year, monthIndex + 1, 1));
  return {
    from,
    to,
    label: from.toLocaleDateString("th-TH", {
      month: "short",
      year: "2-digit",
      timeZone: "UTC",
    }),
    longLabel: `${MONTH_NAMES[((monthIndex % 12) + 12) % 12]} ${year + 543}`,
  };
}

export function yearWindow(year) {
  return {
    from: new Date(Date.UTC(year, 0, 1)),
    to: new Date(Date.UTC(year + 1, 0, 1)),
    label: String(year),
    longLabel: `ปี ${year + 543}`,
  };
}

/** N most recent windows ending with the current one, oldest first. */
export function lastNWindows(granularity, n) {
  const now = new Date();
  const windows = [];
  for (let i = n - 1; i >= 0; i--) {
    windows.push(
      granularity === "year"
        ? yearWindow(now.getUTCFullYear() - i)
        : monthWindow(now.getUTCFullYear(), now.getUTCMonth() - i),
    );
  }
  return windows;
}

export function buildPath(base, win) {
  const q = new URLSearchParams({
    from: win.from.toISOString(),
    to: win.to.toISOString(),
    timezone: TIMEZONE,
  });
  return `${base}?${q.toString()}`;
}

export function buildSeriesPath(base, win, granularity) {
  const q = new URLSearchParams({
    from: win.from.toISOString(),
    to: win.to.toISOString(),
    granularity,
    timezone: TIMEZONE,
  });
  return `${base}?${q.toString()}`;
}

/** "01/ส.ค./69" for one day-bucket ISO period.
 *
 * Month and year must be formatted in the same toLocaleDateString call: th-TH
 * spells out "พ.ศ. 69" when year is requested alone, but drops the era prefix
 * down to a bare "69" once month is formatted alongside it — so a separate
 * year-only call here would silently produce "01/ส.ค./พ.ศ. 69". */
export function dayLabel(isoPeriod) {
  const d = new Date(isoPeriod);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const monthYear = d.toLocaleDateString("th-TH", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
  return `${day}/${monthYear.replace(" ", "/")}`;
}

/** Full Thai month name for one month-bucket ISO period. */
export function monthLabel(isoPeriod) {
  return MONTH_NAMES[new Date(isoPeriod).getUTCMonth()];
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
