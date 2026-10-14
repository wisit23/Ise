const { badRequest } = require("./errors");

const METRIC_DEFINITION_VERSION = "v1";
const DEFAULT_METRIC_TIMEZONE = "Asia/Bangkok";

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Rejects anything Intl does not recognise as an IANA zone, so a typo can't
 * silently fall back to UTC and shift every bucket by the zone's offset. */
function resolveTimezone(timezone) {
  const zone = timezone || DEFAULT_METRIC_TIMEZONE;
  if (typeof zone !== "string") {
    throw badRequest("timezone must be a single IANA time zone name");
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
  } catch {
    throw badRequest(`timezone "${zone}" is not a valid IANA time zone`);
  }
  return zone;
}

const partFormatters = new Map();

/** Calendar date and wall-clock time of `instant` as seen in `timezone`. */
function zonedParts(instant, timezone) {
  if (!partFormatters.has(timezone)) {
    partFormatters.set(
      timezone,
      new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        hourCycle: "h23",
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
      }),
    );
  }
  const parts = {};
  for (const { type, value } of partFormatters
    .get(timezone)
    .formatToParts(instant)) {
    if (type !== "literal") parts[type] = Number(value);
  }
  return {
    year: parts.year,
    monthIndex: parts.month - 1,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

function offsetMs(instant, timezone) {
  const p = zonedParts(instant, timezone);
  const wallAsUtc = Date.UTC(
    p.year,
    p.monthIndex,
    p.day,
    p.hour,
    p.minute,
    p.second,
  );
  return wallAsUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * The instant at which local midnight of (year, monthIndex, day) begins in
 * `timezone`. Out-of-range month/day values roll over like Date.UTC does.
 * The offset is re-read at the candidate instant so a zone whose offset
 * changes that day (DST) still lands on the correct midnight.
 */
function zonedMidnight(year, monthIndex, day, timezone) {
  const wall = Date.UTC(year, monthIndex, day);
  const guess = wall - offsetMs(new Date(wall), timezone);
  return new Date(wall - offsetMs(new Date(guess), timezone));
}

function parseBoundary(value, name, timezone) {
  if (typeof value !== "string") {
    throw badRequest(`${name} must be a single date value`);
  }
  // Date-only values name a calendar day in the report's time zone, so the
  // caller does not have to know that zone's UTC offset.
  const dateOnly = DATE_ONLY.exec(value);
  if (dateOnly) {
    const [, year, month, day] = dateOnly.map(Number);
    const instant = zonedMidnight(year, month - 1, day, timezone);
    const check = zonedParts(instant, timezone);
    if (check.monthIndex !== month - 1 || check.day !== day) {
      throw badRequest(`${name} must be a valid calendar date`);
    }
    return instant;
  }
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) {
    throw badRequest("from/to must be valid ISO dates");
  }
  return instant;
}

/**
 * Shared from/to/timezone parsing so every executive metrics endpoint
 * (auth/order/product) accepts the same query shape and rejects the same
 * way — the Executive dashboard composes results from all three and
 * expects one consistent contract, not three slightly different ones.
 *
 * `from`/`to` accept either `YYYY-MM-DD` (local midnight in `timezone`) or a
 * full ISO instant. With neither given, the range is the current calendar
 * month in `timezone`, so a dashboard has something to show on first load.
 */
function resolveMetricRange(query = {}) {
  const timezone = resolveTimezone(query.timezone);

  if (!query.from && !query.to) {
    const now = zonedParts(new Date(), timezone);
    return {
      from: zonedMidnight(now.year, now.monthIndex, 1, timezone),
      to: zonedMidnight(now.year, now.monthIndex + 1, 1, timezone),
      timezone,
    };
  }

  const from = parseBoundary(query.from, "from", timezone);
  const to = parseBoundary(query.to, "to", timezone);
  return { from, to, timezone };
}

function metricMeta({ from, to, timezone }) {
  return {
    definitionVersion: METRIC_DEFINITION_VERSION,
    timezone,
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

const SERIES_GRANULARITIES = ["day", "month"];
const MAX_SERIES_POINTS = 366;

/**
 * Every bucket start in [from, to) for a day/month series endpoint, where a
 * bucket is a calendar day/month in `timezone` — the same boundaries the
 * providers' SQL produces with `date_trunc` on local time. Shared so a day
 * with zero orders and a day with zero logins still line up on the same date
 * instead of one series silently having a gap the other doesn't (a report
 * table built by zipping two series on array index would misalign the moment
 * either provider skips a day).
 */
function buildSeriesPeriods({
  from,
  to,
  granularity,
  timezone = DEFAULT_METRIC_TIMEZONE,
}) {
  if (!SERIES_GRANULARITIES.includes(granularity)) {
    throw badRequest(
      `granularity must be one of ${SERIES_GRANULARITIES.join(", ")}`,
    );
  }

  const start = zonedParts(from, timezone);
  const bucketAt = (step) =>
    granularity === "day"
      ? zonedMidnight(start.year, start.monthIndex, start.day + step, timezone)
      : zonedMidnight(start.year, start.monthIndex + step, 1, timezone);

  const periods = [];
  for (
    let step = 0, cursor = bucketAt(0);
    cursor < to;
    cursor = bucketAt(++step)
  ) {
    periods.push(cursor);
    if (periods.length > MAX_SERIES_POINTS) {
      throw badRequest(
        `requested range produces more than ${MAX_SERIES_POINTS} points — narrow from/to`,
      );
    }
  }
  return periods;
}

/**
 * Left-joins query rows (each with a `period` bucket-start, as a Date or an
 * ISO string) onto the full period list so every period appears exactly
 * once, in order, defaulting to `zeroRow` when a provider has no rows for
 * that bucket — a real zero, not "unavailable"; the request itself succeeded.
 */
function fillSeriesGaps(periods, rows, zeroRow) {
  const byKey = new Map(
    rows.map((row) => [new Date(row.period).toISOString(), row]),
  );
  return periods.map((period) => {
    const key = period.toISOString();
    const row = byKey.get(key);
    return row ? { ...row, period: key } : { period: key, ...zeroRow };
  });
}

module.exports = {
  METRIC_DEFINITION_VERSION,
  DEFAULT_METRIC_TIMEZONE,
  SERIES_GRANULARITIES,
  MAX_SERIES_POINTS,
  resolveMetricRange,
  metricMeta,
  buildSeriesPeriods,
  fillSeriesGaps,
};
