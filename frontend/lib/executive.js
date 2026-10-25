export * from "./executiveDates";

import { executiveFetch as apiFetch } from "./executiveRequest";
import {
  TIMEZONE,
  LOCALE,
  MONTH_NAMES,
  MONTH_SHORT,
  buddhistYear,
  currentDate,
  currentYearMonth,
  daysInMonth,
  isoDate,
  parseIsoDate,
  addDays,
  spanDays,
  customTrendGranularity,
  thaiDate,
} from "./executiveDates";

/** A count with Thai digit grouping: 1,234. */
export function formatCount(n) {
  return n.toLocaleString(LOCALE);
}

/** Baht rounded to the satang, so float error never shows up on screen. */
export function roundMoney(n) {
  return Math.round(n * 100) / 100;
}

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

export function baht(v) {
  return `฿${v.toLocaleString(LOCALE)}`;
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

function metricSeries(response, fields) {
  const rows = response?.data;
  if (!Array.isArray(rows)) return null;
  const periods = new Set();
  for (const row of rows) {
    if (
      typeof row?.period !== "string" ||
      Number.isNaN(Date.parse(row.period)) ||
      periods.has(row.period) ||
      fields.some((field) => !Number.isFinite(row[field]) || row[field] < 0)
    )
      return null;
    periods.add(row.period);
  }
  return rows;
}

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
    order: metricSeries(fulfilled(results[0]), [
      "gmv",
      "platformRevenue",
      "completedOrders",
    ]),
    auth: metricSeries(fulfilled(results[1]), ["activeUsers"]),
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
    value: "today",
    label: "วันนี้",
    // Up to the same time of day (see overviewPeriods).
    compareLabel: "เทียบกับวันเดียวกันสัปดาห์ที่แล้ว",
    baselineName: "วันเดียวกันสัปดาห์ที่แล้ว",
    trendCaption: "ยอดขายทุก 1 ชั่วโมง · วันนี้",
    usersGranularity: "day",
    periodName: "วันนี้",
  },
  {
    value: "month",
    label: "เดือนนี้",
    compareLabel: "เทียบกับวันเดียวกันของเดือนที่แล้ว",
    baselineName: "วันเดียวกันของเดือนที่แล้ว",
    trendCaption: "ยอดรวมรายเดือน · 6 เดือนล่าสุด",
    usersGranularity: "day",
    periodName: "เดือนนี้",
  },
  {
    value: "year",
    label: "ปีนี้",
    compareLabel: "เทียบกับวันเดือนเดียวกันของปีที่แล้ว",
    baselineName: "วันเดือนเดียวกันของปีที่แล้ว",
    trendCaption: "ยอดรวมรายปี · เฉพาะปีที่มีข้อมูล",
    usersGranularity: "month",
    periodName: "ปีนี้",
  },
];

// One day the executive picks by hand, to look inside it hour by hour. The
// label and captions depend on the date, so describeMode() builds them.
export const CUSTOM_MODE = {
  value: "custom",
  label: "กำหนดเอง",
};

/** Every choice in the overview's period picker. */
export const PERIOD_MODES = [...OVERVIEW_MODES, CUSTOM_MODE];

/**
 * Wording for the overview in one mode. The fixed modes read it from
 * OVERVIEW_MODES; a custom range names its own dates and is compared with the
 * stretch of the same length just before it.
 */
export function describeMode(mode, custom) {
  if (mode !== "custom") return OVERVIEW_MODES.find((m) => m.value === mode);
  const { from, to } = custom;
  const granularity = customTrendGranularity(custom);
  if (granularity === "hour") {
    const date = thaiDate(from);
    return {
      ...CUSTOM_MODE,
      compareLabel: "เทียบกับวันก่อนหน้า",
      baselineName: "วันก่อนหน้า",
      trendCaption: `ยอดขายทุก 1 ชั่วโมง · ${date}`,
      periodName: "ช่วงที่เลือก",
    };
  }
  const dates = `${thaiDate(from)} – ${thaiDate(to)}`;
  return {
    ...CUSTOM_MODE,
    compareLabel: "เทียบกับช่วงก่อนหน้าที่ยาวเท่ากัน",
    baselineName: "ช่วงก่อนหน้าที่ยาวเท่ากัน",
    trendCaption: `${
      granularity === "day" ? "ยอดรายวัน" : "ยอดรายเดือน"
    } · ${dates} (${spanDays(from, to)} วัน)`,
    periodName: "ช่วงที่เลือก",
  };
}

// A week, for comparing a day with the same weekday before it.
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

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
    // The chosen days (both included), the stretch of the same length right
    // before them for the comparison, and the chosen days again for the
    // chart, by the hour, the day or the month depending on how long they are.
    const days = spanDays(custom.from, custom.to);
    const to = addDays(custom.to, 1);
    return {
      current: { from: custom.from, to },
      previous: { from: addDays(custom.from, -days), to: custom.from },
      trend: {
        from: custom.from,
        to,
        granularity: customTrendGranularity(custom),
      },
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

  if (mode === "today") {
    // Today so far, against the same weekday last week up to the same time:
    // half a day of sales is never set against a whole day. Charted by the
    // hour.
    return {
      current: { from: isoDate(year, monthIndex, day), to: end },
      previous: {
        from: isoDate(year, monthIndex, day - 7),
        to: new Date(instant.getTime() - WEEK_MS).toISOString(),
      },
      trend: {
        from: isoDate(year, monthIndex, day),
        to: end,
        granularity: "hour",
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

// Reads the hour (0–23) of an instant on the report clock.
const hourFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: TIMEZONE,
  hour: "numeric",
  hourCycle: "h23",
});

/** One day by the hour. The axis names every third hour (00:00, 03:00 …
 * 21:00) and the last one shown; the points between are unnamed on the axis
 * but read in full when pointed at. */
function hourlyPoints(rows, detailOf) {
  return rows.map((row, i) => {
    const at = new Date(row.period);
    const d = currentDate(at);
    const hour = Number(hourFormat.format(at));
    const start = `${String(hour).padStart(2, "0")}:00`;
    const end = `${String(hour).padStart(2, "0")}:59`;
    const named = i % 3 === 0 || i === rows.length - 1;
    return {
      label: start,
      axisLabel: named ? start : "",
      fullLabel: `${d.day} ${MONTH_SHORT[d.monthIndex]} ${buddhistYear(d.year)} · ${start}–${end}`,
      value: row.gmv,
      detail: detailOf(row.gmv, row.platformRevenue),
    };
  });
}

// The most days named on the axis of a daily chart; the points between stay
// unnamed there but read in full when pointed at.
const MAX_AXIS_NAMES = 8;

/** A point for every day of a custom range. The axis names about eight of
 * them (always the first and the last), each with its month beneath. */
function dailyPoints(rows, detailOf) {
  const every = Math.ceil(rows.length / MAX_AXIS_NAMES);
  return rows.map((row, i) => {
    const d = currentDate(new Date(row.period));
    const named = i % every === 0 || i === rows.length - 1;
    return {
      label: String(d.day),
      axisLabel: named ? String(d.day) : "",
      subLabel: named ? MONTH_SHORT[d.monthIndex] : undefined,
      fullLabel: `${d.day} ${MONTH_SHORT[d.monthIndex]} ${buddhistYear(d.year)}`,
      value: row.gmv,
      detail: detailOf(row.gmv, row.platformRevenue),
    };
  });
}

/** A point for every month a custom range touches. The first and the last may
 * cover only part of the month, and say so when pointed at. */
function monthlyPoints(rows, custom, detailOf) {
  const first = parseIsoDate(custom.from);
  const last = parseIsoDate(custom.to);
  const lastDay = daysInMonth(last.year, last.monthIndex);
  return rows.map((row, i) => {
    const { year, monthIndex } = currentYearMonth(new Date(row.period));
    const partial =
      (i === 0 && first.day !== 1) ||
      (i === rows.length - 1 && last.day !== lastDay);
    return {
      label: MONTH_SHORT[monthIndex],
      // The year goes under the first month and under every January.
      subLabel:
        i === 0 || monthIndex === 0
          ? String(buddhistYear(year) % 100).padStart(2, "0")
          : undefined,
      fullLabel: `${MONTH_NAMES[monthIndex]} ${buddhistYear(year)}${
        partial ? " · เฉพาะวันที่อยู่ในช่วงที่เลือก" : ""
      }`,
      value: row.gmv,
      detail: detailOf(row.gmv, row.platformRevenue),
    };
  });
}

/**
 * Chart points for one overview mode from the order provider's series rows
 * (each `period` is the instant a TIMEZONE bucket starts). The last point of
 * the month and year modes is the period still in progress, so it is named
 * "(ถึง …)" rather than drawn as if it were a full period.
 */
export function buildTrendPoints(mode, rows, instant = new Date(), custom) {
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
        label: String(buddhistYear(y)),
        subLabel: partial ? `(ถึง ${throughText})` : undefined,
        fullLabel: `ปี ${buddhistYear(y)}${partial ? ` · ถึงวันที่ ${throughText}` : " · ทั้งปี"}`,
        value: roundMoney(t.gmv),
        detail: detailOf(t.gmv, roundMoney(t.platformRevenue)),
      };
    });
  }

  if (mode === "custom" && customTrendGranularity(custom) === "day") {
    return dailyPoints(rows, detailOf);
  }

  if (mode === "custom" && customTrendGranularity(custom) === "month") {
    return monthlyPoints(rows, custom, detailOf);
  }

  if (mode === "custom") return hourlyPoints(rows, detailOf);

  if (mode === "today") {
    // The hours still to come are not sales yet: the line stops at this hour
    // instead of falling to zero for the rest of the day.
    return hourlyPoints(
      rows.filter((row) => new Date(row.period) <= instant),
      detailOf,
    );
  }

  return rows.map((row, i) => {
    const { year, monthIndex } = currentYearMonth(new Date(row.period));
    const partial = i === rows.length - 1;
    return {
      label: MONTH_SHORT[monthIndex],
      subLabel: partial ? `(ถึง ${today.day})` : undefined,
      fullLabel: `${MONTH_NAMES[monthIndex]} ${buddhistYear(year)}${partial ? ` · ถึงวันที่ ${throughText}` : " · ทั้งเดือน"}`,
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
  // Web usage is asked by the day, or by the month where the period is long
  // enough that the chart is by the month (a month is the sum of its days).
  const usersGranularity =
    mode === "custom"
      ? periods.trend.granularity === "month"
        ? "month"
        : "day"
      : (OVERVIEW_MODES.find((m) => m.value === mode)?.usersGranularity ??
        "day");
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
  const rows = metricSeries(series, ["gmv", "platformRevenue"]);
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
    trend: rows && buildTrendPoints(mode, rows, instant, custom),
    rankings: rankings?.data ?? null,
    orderStatus: orderStatus?.data ?? null,
  };
}

export const AUDIT_PATH = "/api/auth/executive/audit";

/**
 * Records a report export in the Executive audit log (CEO-DEC-016). Called
 * before the file is handed over, and it throws when the entry was not
 * stored, so no export leaves without a record. The server decides the
 * category and wording (CEO-DEC-012); only the facts are sent.
 */
export async function recordReportExport(
  { granularity, year, monthIndex, rowCount, slug },
  token,
) {
  return apiFetch(AUDIT_PATH, {
    token,
    method: "POST",
    body: {
      action: "REPORT_EXPORT_CSV",
      targetId: slug,
      metadata: {
        granularity,
        year,
        ...(granularity === "month" ? { monthIndex } : {}),
        rowCount,
      },
    },
  });
}
