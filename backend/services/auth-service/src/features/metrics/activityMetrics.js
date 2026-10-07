const { badRequest } = require("@reloop/shared");
const defaultPrisma = require("../../models/prismaClient");

const SUPPORTED_TIMEZONES = ["Asia/Bangkok"];
const DEFAULT_TIMEZONE = "Asia/Bangkok";
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const MAX_HOURLY_DAYS = 31;
const MAX_HOURLY_HOURS = MAX_HOURLY_DAYS * 24;

/**
 * Formats a Date object as an ISO-8601 string with Asia/Bangkok offset (+07:00).
 */
function formatBangkokIsoHour(date) {
  if (!date || Number.isNaN(date.getTime())) return null;
  const bkkDate = new Date(date.getTime() + BANGKOK_OFFSET_MS);
  const y = bkkDate.getUTCFullYear();
  const m = String(bkkDate.getUTCMonth() + 1).padStart(2, "0");
  const d = String(bkkDate.getUTCDate()).padStart(2, "0");
  const h = String(bkkDate.getUTCHours()).padStart(2, "0");
  return `${y}-${m}-${d}T${h}:00:00+07:00`;
}

/**
 * Formats a Date object as an ISO-8601 string preserving minutes and seconds with Asia/Bangkok offset (+07:00).
 */
function formatBangkokIsoBoundary(val) {
  if (!val) return null;
  const date = val instanceof Date ? val : new Date(val);
  if (Number.isNaN(date.getTime())) return null;
  const bkkDate = new Date(date.getTime() + BANGKOK_OFFSET_MS);
  const y = bkkDate.getUTCFullYear();
  const m = String(bkkDate.getUTCMonth() + 1).padStart(2, "0");
  const d = String(bkkDate.getUTCDate()).padStart(2, "0");
  const h = String(bkkDate.getUTCHours()).padStart(2, "0");
  const min = String(bkkDate.getUTCMinutes()).padStart(2, "0");
  const sec = String(bkkDate.getUTCSeconds()).padStart(2, "0");
  return `${y}-${m}-${d}T${h}:${min}:${sec}+07:00`;
}

/**
 * Normalizes input date string: if YYYY-MM-DD, treats it as 00:00:00 Asia/Bangkok.
 */
function parseDateInput(val) {
  if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}$/.test(val.trim())) {
    return new Date(`${val.trim()}T00:00:00+07:00`);
  }
  return new Date(val);
}

/**
 * Validates and normalizes date range [from, to) with boundary and timezone rules.
 * - Timezone must be 'Asia/Bangkok'
 * - Boundary: half-open interval [from, to)
 * - from >= to is rejected with 400
 * - Invalid ISO format is rejected with 400
 * - Range exceeding 31 days is rejected with 400
 * - Default: last 7 days aligned to Bangkok hours
 */
function parseAndValidateRange(query = {}) {
  if (query.timezone && !SUPPORTED_TIMEZONES.includes(query.timezone)) {
    throw badRequest(`unsupported timezone: only 'Asia/Bangkok' is supported`);
  }
  const timezone = DEFAULT_TIMEZONE;

  if (!query.from && !query.to) {
    const now = Date.now();
    const nowBkk = new Date(now + BANGKOK_OFFSET_MS);
    const toBkk = new Date(
      Date.UTC(
        nowBkk.getUTCFullYear(),
        nowBkk.getUTCMonth(),
        nowBkk.getUTCDate(),
        nowBkk.getUTCHours() + 1,
      ),
    );
    const to = new Date(toBkk.getTime() - BANGKOK_OFFSET_MS);
    const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { from, to, timezone };
  }

  if (!query.from || !query.to) {
    throw badRequest(
      "both 'from' and 'to' must be provided when filtering by date",
    );
  }

  const from = parseDateInput(query.from);
  const to = parseDateInput(query.to);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw badRequest("from/to must be valid ISO dates");
  }

  if (from >= to) {
    throw badRequest("from must be strictly before to");
  }

  const diffHours = (to.getTime() - from.getTime()) / (1000 * 60 * 60);
  if (diffHours > MAX_HOURLY_HOURS) {
    throw badRequest(
      `requested range exceeds maximum of ${MAX_HOURLY_DAYS} days for hourly analytics — narrow from/to`,
    );
  }

  return { from, to, timezone };
}

/**
 * Builds array of Bangkok ISO strings for every hour bucket in [from, to).
 */
function buildHourlyPeriods(from, to) {
  const periods = [];
  const cursor = new Date(from);
  // Align cursor to integral hour
  cursor.setUTCMinutes(0, 0, 0);
  while (cursor < to) {
    periods.push(formatBangkokIsoHour(cursor));
    cursor.setTime(cursor.getTime() + 60 * 60 * 1000);
  }
  return periods;
}

/**
 * Finds peak hour with deterministic tie-breaking:
 * If hourlyUsage is empty or all usageCounts are 0, returns { hour: null, usageCount: 0 }.
 * If usage > 0, deterministic tie-breaking selects the earliest hour with maximum usageCount.
 */
function findPeakHour(hourlyUsage) {
  if (!hourlyUsage || hourlyUsage.length === 0) {
    return { hour: null, usageCount: 0 };
  }

  let peak = {
    hour: null,
    usageCount: 0,
  };

  for (const item of hourlyUsage) {
    const count = Number(item.usageCount) || 0;
    if (count > peak.usageCount) {
      peak = { hour: item.hour, usageCount: count };
    }
  }

  return peak;
}

/**
 * Strict serializer that guarantees no PII (email, phone, name, userId, raw payloads)
 * can leak into the response.
 */
function serializeUserAnalytics({
  range,
  activeUsers,
  newUsers,
  peakHour,
  hourlyUsage,
}) {
  return {
    range: {
      from: formatBangkokIsoBoundary(range.from),
      to: formatBangkokIsoBoundary(range.to),
      timezone: range.timezone,
    },
    activeUsers: Number(activeUsers) || 0,
    newUsers: Number(newUsers) || 0,
    peakHour: {
      hour: peakHour?.hour ?? null,
      usageCount: Number(peakHour?.usageCount) || 0,
    },
    hourlyUsage: (hourlyUsage || []).map((item) => ({
      hour: item.hour,
      usageCount: Number(item.usageCount) || 0,
    })),
  };
}

/**
 * Aggregates user analytics (active users, new users, hourly usage, peak hour)
 * from PostgreSQL without loading raw events into memory.
 */
async function getUserUsageAnalytics(
  query = {},
  { prisma: db = defaultPrisma } = {},
) {
  const range = parseAndValidateRange(query);
  const { from, to } = range;

  // 1. New users created in [from, to)
  const newUsersPromise = db.user.count({
    where: {
      createdAt: {
        gte: from,
        lt: to,
      },
    },
  });

  // 2. Distinct active users in [from, to) from trusted activities (login_logs and buyer_activity_logs)
  const activeUsersPromise = db.$queryRaw`
    WITH activities AS (
      SELECT user_id, login_at AS activity_at
      FROM login_logs
      WHERE login_at >= ${from} AND login_at < ${to}
      UNION ALL
      SELECT buyer_id AS user_id, occurred_at AS activity_at
      FROM buyer_activity_logs
      WHERE occurred_at >= ${from} AND occurred_at < ${to}
    )
    SELECT COUNT(DISTINCT user_id)::int AS count
    FROM activities
  `;

  // 3. Hourly usage aggregation in [from, to) using Asia/Bangkok timezone
  const hourlyRowsPromise = db.$queryRaw`
    WITH activities AS (
      SELECT user_id, login_at AS activity_at
      FROM login_logs
      WHERE login_at >= ${from} AND login_at < ${to}
      UNION ALL
      SELECT buyer_id AS user_id, occurred_at AS activity_at
      FROM buyer_activity_logs
      WHERE occurred_at >= ${from} AND occurred_at < ${to}
    )
    SELECT to_char(date_trunc('hour', (activity_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Bangkok'), 'YYYY-MM-DD"T"HH24:MI:SS+07:00') AS hour,
           COUNT(DISTINCT user_id)::int AS "usageCount"
    FROM activities
    GROUP BY date_trunc('hour', (activity_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Bangkok')
    ORDER BY date_trunc('hour', (activity_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Bangkok') ASC
  `;

  // Execute concurrently. Errors propagate immediately — never swallowed.
  const [newUsers, activeUserRows, hourlyRows] = await Promise.all([
    newUsersPromise,
    activeUsersPromise,
    hourlyRowsPromise,
  ]);

  const activeUsers = activeUserRows?.[0]?.count ?? 0;

  // Build complete hourly periods in Asia/Bangkok and gap-fill
  const periods = buildHourlyPeriods(from, to);
  const rowMap = new Map();
  if (Array.isArray(hourlyRows)) {
    for (const row of hourlyRows) {
      const hourKey =
        typeof row.hour === "string"
          ? row.hour
          : formatBangkokIsoHour(new Date(row.hour));
      if (hourKey) {
        rowMap.set(hourKey, Number(row.usageCount) || 0);
      }
    }
  }

  const hourlyUsage = periods.map((hour) => ({
    hour,
    usageCount: rowMap.get(hour) || 0,
  }));

  const peakHour = findPeakHour(hourlyUsage);

  return serializeUserAnalytics({
    range,
    activeUsers,
    newUsers,
    peakHour,
    hourlyUsage,
  });
}

module.exports = {
  DEFAULT_TIMEZONE,
  SUPPORTED_TIMEZONES,
  MAX_HOURLY_DAYS,
  formatBangkokIsoHour,
  formatBangkokIsoBoundary,
  parseAndValidateRange,
  buildHourlyPeriods,
  findPeakHour,
  serializeUserAnalytics,
  getUserUsageAnalytics,
};
