const { badRequest } = require("./errors");

const METRIC_DEFINITION_VERSION = "v1";
const DEFAULT_METRIC_TIMEZONE = "Asia/Bangkok";

// No from/to given: default to the current calendar month (UTC) so a
// dashboard has something to show on first load instead of erroring.
function currentMonthRangeUTC() {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { from, to };
}

/**
 * Shared from/to/timezone parsing so every executive metrics endpoint
 * (auth/order/product) accepts the same query shape and rejects the same
 * way — the Executive dashboard composes results from all three and
 * expects one consistent contract, not three slightly different ones.
 */
function resolveMetricRange(query = {}) {
  const timezone = query.timezone || DEFAULT_METRIC_TIMEZONE;

  if (!query.from && !query.to) {
    return { ...currentMonthRangeUTC(), timezone };
  }

  const from = new Date(query.from);
  const to = new Date(query.to);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw badRequest("from/to must be valid ISO dates");
  }
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
 * Every UTC bucket start in [from, to) for a day/month series endpoint —
 * shared so a day with zero orders and a day with zero logins still line up
 * on the same date instead of one series silently having a gap the other
 * doesn't (a report table built by zipping two series on array index would
 * misalign the moment either provider skips a day).
 */
function buildSeriesPeriods({ from, to, granularity }) {
  if (!SERIES_GRANULARITIES.includes(granularity)) {
    throw badRequest(
      `granularity must be one of ${SERIES_GRANULARITIES.join(", ")}`,
    );
  }

  const periods = [];
  let cursor = new Date(from);
  while (cursor < to) {
    periods.push(new Date(cursor));
    cursor =
      granularity === "day"
        ? new Date(
            Date.UTC(
              cursor.getUTCFullYear(),
              cursor.getUTCMonth(),
              cursor.getUTCDate() + 1,
            ),
          )
        : new Date(
            Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1),
          );

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
