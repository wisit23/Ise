const { resolveMetricRange, metricMeta } = require("@reloop/shared");
const marketingSalesMetrics = require("./marketingSalesMetrics");

async function getSalesDashboard(req, res, next) {
  try {
    const { from, to, timezone } = resolveMetricRange(req.query);
    const data = await marketingSalesMetrics.getSalesDashboard({ from, to });
    res.json({ data, meta: metricMeta({ from, to, timezone }) });
  } catch (error) {
    next(error);
  }
}

module.exports = { getSalesDashboard };
