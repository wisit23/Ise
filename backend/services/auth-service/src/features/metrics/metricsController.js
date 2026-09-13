const {
  resolveMetricRange,
  metricMeta,
  badRequest,
  METRIC_DEFINITION_VERSION,
  buildSeriesPeriods,
  fillSeriesGaps,
} = require("@reloop/shared");
const userMetrics = require("./userMetrics");
const executiveReports = require("./executiveReports");

const REPORT_STATUSES = ["OPEN", "REVIEWED", "ACTIONED", "DISMISSED"];
const MAX_REPORT_LIMIT = 100;

async function getMetrics(req, res, next) {
  try {
    const { from, to, timezone } = resolveMetricRange(req.query);
    const data = await userMetrics.getUserMetrics({ from, to });

    res.json({ data, meta: metricMeta({ from, to, timezone }) });
  } catch (err) {
    next(err);
  }
}

async function getMetricsSeries(req, res, next) {
  try {
    const { from, to, timezone } = resolveMetricRange(req.query);
    const granularity = req.query.granularity;
    const periods = buildSeriesPeriods({ from, to, granularity });

    const rows = await userMetrics.getUserMetricsSeries({
      from,
      to,
      granularity,
    });
    const data = fillSeriesGaps(periods, rows, { activeUsers: 0 });

    res.json({ data, meta: metricMeta({ from, to, timezone }) });
  } catch (err) {
    next(err);
  }
}

const VALID_SORT_OPTIONS = ["newest", "oldest", "most_reported"];
const VALID_REASON_CATEGORIES = ["FRAUD", "COUNTERFEIT", "MISMATCH", "OTHER"];

async function getReports(req, res, next) {
  try {
    const { status, sortBy, reasonCategory, targetId } = req.query;
    if (status && !REPORT_STATUSES.includes(status)) {
      throw badRequest(`status must be one of ${REPORT_STATUSES.join(", ")}`);
    }
    if (sortBy && !VALID_SORT_OPTIONS.includes(sortBy)) {
      throw badRequest(
        `sortBy must be one of ${VALID_SORT_OPTIONS.join(", ")}`,
      );
    }
    if (reasonCategory && !VALID_REASON_CATEGORIES.includes(reasonCategory)) {
      throw badRequest(
        `reasonCategory must be one of ${VALID_REASON_CATEGORIES.join(", ")}`,
      );
    }

    const limit = req.query.limit ? Number(req.query.limit) : 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_REPORT_LIMIT) {
      throw badRequest(
        `limit must be an integer between 1 and ${MAX_REPORT_LIMIT}`,
      );
    }

    const data = await executiveReports.getReportOverview({
      status,
      limit,
      sortBy: sortBy || "newest",
      reasonCategory,
      targetId,
    });

    // Complaints are a live queue, not a windowed aggregate, so there is no
    // from/to to report here — only the definition version applies.
    res.json({
      data,
      meta: { definitionVersion: METRIC_DEFINITION_VERSION },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getMetrics, getMetricsSeries, getReports };
