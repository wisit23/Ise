const {
  resolveMetricRange,
  metricMeta,
  buildSeriesPeriods,
  fillSeriesGaps,
  METRIC_DEFINITION_VERSION,
  SERIES_GRANULARITIES,
  SLOT_GRANULARITY,
  parsePagination,
  paginatedResponse,
  badRequest,
  notFound,
} = require("@reloop/shared");
const platformMetrics = require("./platformMetrics");
const { getPlatformFeeRate } = require("./feeConfig");
const orderStatusMetrics = require("./orderStatusMetrics");
const executiveDisputes = require("./executiveDisputes");
const { getExecutiveDispute } = require("./executiveDisputeDetail");

async function getMetrics(req, res, next) {
  try {
    const { from, to, timezone } = resolveMetricRange(req.query);
    const data = await platformMetrics.getPlatformMetrics({ from, to });

    res.json({
      data,
      meta: {
        ...metricMeta({ from, to, timezone }),
        platformFeeRate: getPlatformFeeRate(),
      },
    });
  } catch (err) {
    next(err);
  }
}

async function getMetricsSeries(req, res, next) {
  try {
    const { from, to, timezone } = resolveMetricRange(req.query);
    const granularity = req.query.granularity;
    // Day and month like every series endpoint, plus hourly slots for
    // looking inside one day.
    const periods = buildSeriesPeriods({
      from,
      to,
      granularity,
      timezone,
      granularities: [...SERIES_GRANULARITIES, SLOT_GRANULARITY],
    });

    const rows = await platformMetrics.getPlatformMetricsSeries({
      from,
      to,
      granularity,
      timezone,
    });
    const data = fillSeriesGaps(periods, rows, {
      gmv: 0,
      platformRevenue: 0,
      completedOrders: 0,
    });

    res.json({
      data,
      meta: {
        ...metricMeta({ from, to, timezone }),
        platformFeeRate: getPlatformFeeRate(),
      },
    });
  } catch (err) {
    next(err);
  }
}

async function getOrderStatus(req, res, next) {
  try {
    const { from, to, timezone } = resolveMetricRange(req.query);
    const data = await orderStatusMetrics.getOrderStatusBreakdown({ from, to });

    res.json({ data, meta: metricMeta({ from, to, timezone }) });
  } catch (err) {
    next(err);
  }
}

// A filter value must be one the page offers, or the request is refused: an
// unknown status silently matching nothing would read as "no disputes".
function oneOf(value, allowed, name) {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw badRequest(`${name} must be one of ${allowed.join(", ")}`);
  }
  return value;
}

async function getDisputes(req, res, next) {
  try {
    const { from, to, timezone } = resolveMetricRange(req.query);
    const pagination = parsePagination(req.query, 20);
    const filters = {
      status: oneOf(
        req.query.status,
        executiveDisputes.DISPUTE_STATUSES,
        "status",
      ),
      disputeType: oneOf(
        req.query.disputeType,
        executiveDisputes.DISPUTE_TYPES,
        "disputeType",
      ),
      priority: oneOf(
        req.query.priority,
        executiveDisputes.DISPUTE_PRIORITIES,
        "priority",
      ),
    };
    const { items, total, statusCounts } =
      await executiveDisputes.listExecutiveDisputes({
        from,
        to,
        ...filters,
        skip: pagination.skip,
        take: pagination.take,
      });

    res.json({
      ...paginatedResponse(items, total, pagination),
      data: items,
      statusCounts,
      options: {
        statuses: executiveDisputes.DISPUTE_STATUSES,
        types: executiveDisputes.DISPUTE_TYPES,
        priorities: executiveDisputes.DISPUTE_PRIORITIES,
      },
      meta: metricMeta({ from, to, timezone }),
    });
  } catch (err) {
    next(err);
  }
}

async function getDispute(req, res, next) {
  try {
    const detail = await getExecutiveDispute(req.params.id);
    if (!detail) throw notFound("dispute not found");
    res.json({
      data: detail.data,
      meta: { definitionVersion: METRIC_DEFINITION_VERSION, ...detail.meta },
    });
  } catch (err) {
    next(err);
  }
}

async function getFirstSale(req, res, next) {
  try {
    const firstSaleAt = await platformMetrics.getFirstSaleAt();

    // Not a windowed aggregate, so only the definition version applies.
    res.json({
      data: { firstSaleAt: firstSaleAt ? firstSaleAt.toISOString() : null },
      meta: { definitionVersion: METRIC_DEFINITION_VERSION },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getDisputes,
  getDispute,
  getMetrics,
  getMetricsSeries,
  getOrderStatus,
  getFirstSale,
};
