import { apiFetch } from "./api";

export const TIMEZONE =
  process.env.NEXT_PUBLIC_REPORT_TIMEZONE || "Asia/Bangkok";

/**
 * The fee as a percentage for a label ("3", "2.5"), from the fraction the
 * order service sends in `meta.platformFeeRate`. Null when the service did not
 * say, so a label can drop the figure instead of showing a guess.
 */
export function feePercent(rate) {
  if (typeof rate !== "number" || !Number.isFinite(rate)) return null;
  return Math.round(rate * 10000) / 100;
}

/** What a category row is called on screen. A sale whose category is not known
 * comes with no label, and this says so. */
export function categoryName(row) {
  return row.label ?? "ไม่ระบุหมวดหมู่";
}

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

export const MONTH_SHORT = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

export function baht(v) {
  return `฿${v.toLocaleString("th-TH")}`;
}

/** Calendar date of `instant` in the report time zone — "today" for a Bangkok
 * executive changes at Bangkok midnight, not UTC's. */
export function currentDate(instant = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TIMEZONE,
      year: "numeric",
      month: "numeric",
      day: "numeric",
    })
      .formatToParts(instant)
      .map(({ type, value }) => [type, value]),
  );
  return {
    year: Number(parts.year),
    monthIndex: Number(parts.month) - 1,
    day: Number(parts.day),
  };
}

/** Calendar year and month of `instant` in the report time zone. */
export function currentYearMonth(instant = new Date()) {
  const { year, monthIndex } = currentDate(instant);
  return { year, monthIndex };
}

function daysInMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/** "YYYY-MM-DD" for a calendar date; month/day overflow rolls like Date.UTC. */
export function isoDate(year, monthIndex, day) {
  return new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10);
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar date from "YYYY-MM-DD" as { year, monthIndex, day }, or
 * null when it is not one (a typed 2025-02-30, an empty field). */
export function parseIsoDate(value) {
  const match = typeof value === "string" ? ISO_DATE.exec(value) : null;
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return null;
  }
  return { year, monthIndex: month - 1, day };
}

/** "YYYY-MM-DD" `days` after (or before, if negative) another such date. */
export function addDays(value, days) {
  const { year, monthIndex, day } = parseIsoDate(value);
  return isoDate(year, monthIndex, day + days);
}

/** "16 ต.ค. 2568" for a calendar date. */
export function thaiDate(value) {
  const { year, monthIndex, day } = parseIsoDate(value);
  return `${day} ${MONTH_SHORT[monthIndex]} ${year + 543}`;
}

/** "16/10/2569" (day/month/Buddhist year) for a "YYYY-MM-DD" date. */
export function formatDayField(value) {
  const parsed = parseIsoDate(value);
  if (!parsed) return "";
  const dd = String(parsed.day).padStart(2, "0");
  const mm = String(parsed.monthIndex + 1).padStart(2, "0");
  return `${dd}/${mm}/${parsed.year + 543}`;
}

/** Keeps what is typed into the day field to digits laid out as dd/mm/yyyy. */
export function maskDayField(text) {
  const digits = String(text).replace(/\D/g, "").slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)]
    .filter(Boolean)
    .join("/");
}

/** "YYYY-MM-DD" from a complete "dd/mm/yyyy" in the Buddhist era, or null
 * while it is unfinished or not a real date (31/02/2569). */
export function parseDayField(text) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!match) return null;
  const [, day, month, buddhistYear] = match.map(Number);
  const iso = isoDate(buddhistYear - 543, month - 1, day);
  return parseIsoDate(iso) && formatDayField(iso) === text ? iso : null;
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
  order: "/api/orders/executive/metrics",
};

export const RANKING_PATH = "/api/products/executive/top-catalog";
export const FIRST_SALE_PATH = "/api/orders/executive/first-sale";
export const ORDER_STATUS_PATH = "/api/orders/executive/order-status";

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
    feeRate: fulfilled(results[0])?.meta?.platformFeeRate ?? null,
  };
}

/**
 * The calendar year (in the report time zone) of the first sale. A number when
 * something has sold, null while nothing has, and undefined when the order
 * service could not say — three different things the caller must not mix up.
 */
export async function fetchFirstSaleYear(token) {
  try {
    const response = await apiFetch(FIRST_SALE_PATH, { token });
    const firstSaleAt = response?.data?.firstSaleAt;
    if (firstSaleAt === null) return null;
    const at = new Date(firstSaleAt);
    if (typeof firstSaleAt !== "string" || Number.isNaN(at.getTime())) {
      return undefined;
    }
    return currentYearMonth(at).year;
  } catch {
    return undefined;
  }
}

/**
 * The years a report can be run for, newest first: from the year of the first
 * sale up to this year. With no sale yet only this year is offered; if the
 * first sale is unknown, the last MAX_TREND_YEARS years stand in so history
 * stays reachable instead of disappearing.
 */
export function reportYears(firstSaleYear, instant = new Date()) {
  const thisYear = currentYearMonth(instant).year;
  const first =
    firstSaleYear === undefined
      ? thisYear - (MAX_TREND_YEARS - 1)
      : Math.min(firstSaleYear ?? thisYear, thisYear);
  const years = [];
  for (let year = thisYear; year >= first; year--) years.push(year);
  return years;
}

export const OVERVIEW_MODES = [
  {
    value: "week",
    label: "7 วันล่าสุด",
    compareLabel: "เทียบกับ 7 วันก่อนหน้านี้",
    baselineName: "7 วันก่อนหน้านี้",
    trendCaption: "ยอดรายวัน · 7 วันล่าสุด",
    usersGranularity: "day",
    periodName: "7 วันล่าสุด",
    inPeriod: "ใน 7 วันล่าสุด",
  },
  {
    value: "month",
    label: "เดือนนี้",
    compareLabel: "เทียบกับวันเดียวกันของเดือนที่แล้ว",
    baselineName: "วันเดียวกันของเดือนที่แล้ว",
    trendCaption: "ยอดรวมรายเดือน · 6 เดือนล่าสุด",
    usersGranularity: "day",
    periodName: "เดือนนี้",
    inPeriod: "ในเดือนนี้",
  },
  {
    value: "year",
    label: "ปีนี้",
    compareLabel: "เทียบกับวันเดือนเดียวกันของปีที่แล้ว",
    baselineName: "วันเดือนเดียวกันของปีที่แล้ว",
    trendCaption: "ยอดรวมรายปี · เฉพาะปีที่มีข้อมูล",
    usersGranularity: "month",
    periodName: "ปีนี้",
    inPeriod: "ในปีนี้",
  },
];

// One day the executive picks by hand, to look inside it hour by hour. The
// label and captions depend on the date, so describeMode() builds them.
export const CUSTOM_MODE = {
  value: "custom",
  label: "กำหนดเอง",
  usersGranularity: "day",
};

/** Every choice in the overview's period picker. */
export const PERIOD_MODES = [...OVERVIEW_MODES, CUSTOM_MODE];

/** Today as "YYYY-MM-DD" in the report time zone, the first day offered. */
export function defaultCustomDay(instant = new Date()) {
  const { year, monthIndex, day } = currentDate(instant);
  return isoDate(year, monthIndex, day);
}

/** Why a custom day cannot be used, in Thai, or "" when it can. */
export function customDayError(day, instant = new Date()) {
  if (!parseIsoDate(day)) return "กรุณาเลือกวันที่";
  if (day > defaultCustomDay(instant)) return "เลือกวันที่ในอนาคตไม่ได้";
  return "";
}

/**
 * Wording for the overview in one mode. The fixed modes read it from
 * OVERVIEW_MODES; a custom day names its own date and is compared with the
 * day before.
 */
export function describeMode(mode, customDay) {
  if (mode !== "custom") return OVERVIEW_MODES.find((m) => m.value === mode);
  const date = thaiDate(customDay);
  return {
    ...CUSTOM_MODE,
    compareLabel: "เทียบกับวันก่อนหน้า",
    baselineName: "วันก่อนหน้า",
    trendCaption: `ยอดขายทุก 1 ชั่วโมง · ${date}`,
    periodName: date,
    inPeriod: `ในวันที่ ${date}`,
  };
}

/** Most calendar years the yearly trend reaches back (NFR-SC-02 keeps five). */
export const MAX_TREND_YEARS = 5;
const TREND_MONTHS = 6;

/**
 * Date ranges for one overview mode, all as local `YYYY-MM-DD` with an
 * exclusive end, which the backend reads as midnight in TIMEZONE.
 *
 * `current` and `previous` always cover the same number of days (or the same
 * month-day span a year earlier) so the KPI comparison is like for like;
 * `trend` is wider and drives the chart of whole periods.
 */
export function overviewPeriods(mode, instant = new Date(), custom) {
  const { year, monthIndex, day } = currentDate(instant);
  const end = isoDate(year, monthIndex, day + 1);

  if (mode === "custom") {
    // The chosen day, the day before it for the comparison, and the chosen
    // day again in hourly slots for the chart.
    const to = addDays(custom, 1);
    return {
      current: { from: custom, to },
      previous: { from: addDays(custom, -1), to: custom },
      trend: { from: custom, to, granularity: "hour" },
    };
  }

  if (mode === "year") {
    return {
      current: { from: isoDate(year, 0, 1), to: end },
      previous: {
        from: isoDate(year - 1, 0, 1),
        // 29 February has no counterpart in a common year: stop at the 28th.
        to: isoDate(
          year - 1,
          monthIndex,
          Math.min(day, daysInMonth(year - 1, monthIndex)) + 1,
        ),
      },
      trend: {
        from: isoDate(year - (MAX_TREND_YEARS - 1), 0, 1),
        to: end,
        granularity: "month",
      },
    };
  }

  if (mode === "week") {
    return {
      current: { from: isoDate(year, monthIndex, day - 6), to: end },
      previous: {
        from: isoDate(year, monthIndex, day - 13),
        to: isoDate(year, monthIndex, day - 6),
      },
      trend: {
        from: isoDate(year, monthIndex, day - 6),
        to: end,
        granularity: "day",
      },
    };
  }

  // A shorter previous month (Mar 30 vs Feb) is compared in full.
  const previousLength = daysInMonth(year, monthIndex - 1);
  return {
    current: { from: isoDate(year, monthIndex, 1), to: end },
    previous: {
      from: isoDate(year, monthIndex - 1, 1),
      to: isoDate(year, monthIndex - 1, Math.min(day, previousLength) + 1),
    },
    trend: {
      from: isoDate(year, monthIndex - (TREND_MONTHS - 1), 1),
      to: end,
      granularity: "month",
    },
  };
}

/**
 * Chart points for one overview mode from the order provider's series rows
 * (each `period` is the instant a TIMEZONE bucket starts). The last point of
 * the month and year modes is the period still in progress, so it is named
 * "(ถึง …)" rather than drawn as if it were a full period.
 */
export function buildTrendPoints(mode, rows, instant = new Date()) {
  const today = currentDate(instant);
  const throughText = `${today.day} ${MONTH_SHORT[today.monthIndex]}`;
  const detailOf = (gmv, revenue) =>
    `ยอดขาย ${baht(gmv)} · รายได้แพลตฟอร์ม ${baht(revenue)}`;

  if (mode === "year") {
    const byYear = new Map();
    for (const row of rows) {
      const { year } = currentYearMonth(new Date(row.period));
      const total = byYear.get(year) || {
        gmv: 0,
        platformRevenue: 0,
        completedOrders: 0,
      };
      total.gmv += row.gmv || 0;
      total.platformRevenue += row.platformRevenue || 0;
      total.completedOrders += row.completedOrders || 0;
      byYear.set(year, total);
    }
    const years = [...byYear.keys()].sort((a, b) => a - b);
    // Years before the first sale are not zeros, they predate the platform.
    const firstSale = years.findIndex(
      (y) => byYear.get(y).gmv > 0 || byYear.get(y).completedOrders > 0,
    );
    const shown = years.slice(
      firstSale === -1
        ? years.length - 1
        : Math.min(firstSale, years.length - 1),
    );
    return shown.map((y) => {
      const t = byYear.get(y);
      const partial = y === today.year;
      return {
        label: String(y + 543),
        subLabel: partial ? `(ถึง ${throughText})` : undefined,
        fullLabel: `ปี ${y + 543}${partial ? ` · ถึงวันที่ ${throughText}` : " · ทั้งปี"}`,
        value: Math.round(t.gmv * 100) / 100,
        detail: detailOf(t.gmv, Math.round(t.platformRevenue * 100) / 100),
      };
    });
  }

  if (mode === "custom") {
    // One day by the hour. The axis names every third hour (00:00, 03:00 …
    // 21:00) and the last, 23:00; the points between are unnamed on the axis
    // but read in full when pointed at.
    return rows.map((row, i) => {
      const at = new Date(row.period);
      const d = currentDate(at);
      const hour = Number(
        new Intl.DateTimeFormat("en-US", {
          timeZone: TIMEZONE,
          hour: "numeric",
          hourCycle: "h23",
        }).format(at),
      );
      const start = `${String(hour).padStart(2, "0")}:00`;
      const end = `${String(hour).padStart(2, "0")}:59`;
      const named = i % 3 === 0 || i === rows.length - 1;
      return {
        label: start,
        axisLabel: named ? start : "",
        fullLabel: `${d.day} ${MONTH_SHORT[d.monthIndex]} ${d.year + 543} · ${start}–${end}`,
        value: row.gmv,
        detail: detailOf(row.gmv, row.platformRevenue),
      };
    });
  }

  if (mode === "week") {
    return rows.map((row) => {
      const at = new Date(row.period);
      const d = currentDate(at);
      return {
        label: String(d.day),
        subLabel: MONTH_SHORT[d.monthIndex],
        fullLabel: `${d.day} ${MONTH_SHORT[d.monthIndex]} ${String((d.year + 543) % 100).padStart(2, "0")}`,
        value: row.gmv,
        detail: detailOf(row.gmv, row.platformRevenue),
      };
    });
  }

  return rows.map((row, i) => {
    const { year, monthIndex } = currentYearMonth(new Date(row.period));
    const partial = i === rows.length - 1;
    return {
      label: MONTH_SHORT[monthIndex],
      subLabel: partial ? `(ถึง ${today.day})` : undefined,
      fullLabel: `${MONTH_NAMES[monthIndex]} ${year + 543}${partial ? ` · ถึงวันที่ ${throughText}` : " · ทั้งเดือน"}`,
      value: row.gmv,
      detail: detailOf(row.gmv, row.platformRevenue),
    };
  });
}

/**
 * Web usage for a period: the people who came on each day added up, so
 * someone who returns on three days counts three times (CEO-DEC-007). A year
 * asks for month buckets only to keep the request small — the provider already
 * makes each month the sum of its days. Null when the series is missing or
 * malformed, so an outage is never shown as zero.
 */
function sumActiveUsers(response) {
  const rows = response?.data;
  if (!Array.isArray(rows)) return null;
  if (!rows.every((row) => Number.isFinite(row?.activeUsers))) return null;
  return rows.reduce((total, row) => total + row.activeUsers, 0);
}

/**
 * Everything the overview shows for one mode, fetched in parallel from the
 * owning services. Never rejects: a failed provider comes back as null so the
 * caller renders "ไม่พร้อมใช้งาน" rather than a zero (CEO-DEC-003).
 */
export async function fetchOverview(mode, token, instant = new Date(), custom) {
  const periods = overviewPeriods(mode, instant, custom);
  const get = (path) => apiFetch(path, { token });
  const usersGranularity =
    OVERVIEW_MODES.find((m) => m.value === mode)?.usersGranularity ?? "day";
  const settled = await Promise.allSettled([
    get(buildPath(PROVIDERS.order, periods.current)),
    get(buildPath(PROVIDERS.order, periods.previous)),
    get(
      buildSeriesPath(SERIES_PROVIDERS.auth, periods.current, usersGranularity),
    ),
    get(
      buildSeriesPath(
        SERIES_PROVIDERS.auth,
        periods.previous,
        usersGranularity,
      ),
    ),
    get(
      buildSeriesPath(
        SERIES_PROVIDERS.order,
        periods.trend,
        periods.trend.granularity,
      ),
    ),
    get(buildPath(RANKING_PATH, periods.current)),
    get(buildPath(ORDER_STATUS_PATH, periods.current)),
  ]);
  const [order, orderPrev, auth, authPrev, series, rankings, orderStatus] =
    settled.map(fulfilled);
  const rows = Array.isArray(series?.data) ? series.data : null;
  const users = sumActiveUsers(auth);
  const usersPrevious = sumActiveUsers(authPrev);

  return {
    periods,
    feeRate: order?.meta?.platformFeeRate ?? null,
    order: order && { current: order.data, previous: orderPrev?.data ?? null },
    auth:
      users === null
        ? null
        : {
            current: { activeUsers: users },
            previous:
              usersPrevious === null ? null : { activeUsers: usersPrevious },
          },
    trend: rows && buildTrendPoints(mode, rows, instant),
    rankings: rankings?.data ?? null,
    orderStatus: orderStatus?.data ?? null,
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
