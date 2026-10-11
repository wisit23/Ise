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
const { DEFAULT_REPORT_LIMIT, MAX_REPORT_LIMIT } = require("./reportConfig");

const REPORT_STATUSES = ["OPEN", "REVIEWED", "ACTIONED", "DISMISSED", "ALL"];

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
    const { status, sortBy, reasonCategory, targetId, search } = req.query;
    for (const name of [
      "status",
      "sortBy",
      "reasonCategory",
      "targetId",
      "limit",
      "search",
      "page",
    ]) {
      if (
        req.query[name] !== undefined &&
        typeof req.query[name] !== "string"
      ) {
        throw badRequest(`${name} must be a single string value`);
      }
    }
    if (search !== undefined && search.length > 100) {
      throw badRequest("search must not exceed 100 characters");
    }
    const page = req.query.page === undefined ? 1 : Number(req.query.page);
    if (req.query.page !== undefined && !/^\d+$/.test(req.query.page)) {
      throw badRequest("page must be a positive integer");
    }
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      !Number.isSafeInteger((page - 1) * MAX_REPORT_LIMIT)
    ) {
      throw badRequest("page must be a valid positive integer");
    }
    if (targetId !== undefined && (!targetId.trim() || targetId.length > 200)) {
      throw badRequest(
        "targetId must be a non-empty identifier of at most 200 characters",
      );
    }
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

    if (req.query.limit !== undefined && !/^\d+$/.test(req.query.limit)) {
      throw badRequest("limit must be a positive integer");
    }
    const limit =
      req.query.limit !== undefined
        ? Number(req.query.limit)
        : DEFAULT_REPORT_LIMIT;
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
      targetId: targetId?.trim(),
      search: search?.trim(),
      page,
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
