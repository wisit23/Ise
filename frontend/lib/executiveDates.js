export const TIMEZONE =
  process.env.NEXT_PUBLIC_REPORT_TIMEZONE || "Asia/Bangkok";

// Numbers and dates on the Executive pages are written the Thai way.
export const LOCALE = "th-TH";
// The Buddhist era is 543 years ahead of the Gregorian calendar.
export const BUDDHIST_ERA_OFFSET = 543;

/** A Gregorian year as the Buddhist-era year Thai readers expect. */
export function buddhistYear(year) {
  return year + BUDDHIST_ERA_OFFSET;
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

export function daysInMonth(year, monthIndex) {
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
  return `${day} ${MONTH_SHORT[monthIndex]} ${buddhistYear(year)}`;
}

/** "16/10/2569" (day/month/Buddhist year) for a "YYYY-MM-DD" date. */
export function formatDayField(value) {
  const parsed = parseIsoDate(value);
  if (!parsed) return "";
  const dd = String(parsed.day).padStart(2, "0");
  const mm = String(parsed.monthIndex + 1).padStart(2, "0");
  return `${dd}/${mm}/${buddhistYear(parsed.year)}`;
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
  const [, day, month, beYear] = match.map(Number);
  const iso = isoDate(beYear - BUDDHIST_ERA_OFFSET, month - 1, day);
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
    label: start.toLocaleDateString(LOCALE, {
      month: "short",
      year: "2-digit",
      timeZone: "UTC",
    }),
    longLabel: `${MONTH_NAMES[start.getUTCMonth()]} ${buddhistYear(start.getUTCFullYear())}`,
  };
}

export function yearWindow(year) {
  return {
    from: isoDate(year, 0, 1),
    to: isoDate(year + 1, 0, 1),
    label: String(year),
    longLabel: `ปี ${buddhistYear(year)}`,
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
  const monthYear = d.toLocaleDateString(LOCALE, {
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

/** The longest custom range, in days. */
export const MAX_RANGE_DAYS = 366;
// Up to this many days the chart has a point for every day, so the further
// apart the two dates are, the more points it has. A longer range has a point
// for every month, which keeps the line readable (and under the 366 points a
// series may have).
export const DAILY_POINTS_MAX_DAYS = 92;

/** Calendar days `from` to `to` inclusive. */
export function spanDays(from, to) {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86400000) + 1;
}

/**
 * Why a range of days cannot be used, in Thai, or "" when it can. Both ends
 * are days to include; neither may be in the future.
 */
export function dayRangeError(range, instant = new Date()) {
  const error =
    customDayError(range?.from, instant) || customDayError(range?.to, instant);
  if (error) return error;
  if (range.from > range.to) return "วันที่เริ่มต้นต้องไม่หลังวันที่สิ้นสุด";
  if (spanDays(range.from, range.to) > MAX_RANGE_DAYS) {
    return `เลือกได้ไม่เกิน ${MAX_RANGE_DAYS} วัน`;
  }
  return "";
}

/**
 * How the chart of a custom range is cut: by the hour for one day, by the day
 * up to DAILY_POINTS_MAX_DAYS days, by the month beyond that.
 */
export function customTrendGranularity({ from, to }) {
  const days = spanDays(from, to);
  if (days <= 1) return "hour";
  return days <= DAILY_POINTS_MAX_DAYS ? "day" : "month";
}
