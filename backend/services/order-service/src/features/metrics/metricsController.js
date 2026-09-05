const {
  resolveMetricRange,
  metricMeta,
  buildSeriesPeriods,
  fillSeriesGaps,
} = require("@reloop/shared");
const platformMetrics = require("./platformMetrics");

async function getMetrics(req, res, next) {
  try {
    const { from, to, timezone } = resolveMetricRange(req.query);
    const data = await platformMetrics.getPlatformMetrics({ from, to });

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

    const rows = await platformMetrics.getPlatformMetricsSeries({
      from,
      to,
      granularity,
    });
    const data = fillSeriesGaps(periods, rows, {
      gmv: 0,
      platformRevenue: 0,
      completedOrders: 0,
    });

    res.json({ data, meta: metricMeta({ from, to, timezone }) });
  } catch (err) {
    next(err);
  }
}

module.exports = { getMetrics, getMetricsSeries };
