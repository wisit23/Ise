const {
  resolveMetricRange,
  metricMeta,
  badRequest,
} = require("@reloop/shared");
const catalogMetrics = require("./catalogMetrics");
const topCatalog = require("./topCatalog");

const MAX_RANKING_LIMIT = 50;

async function getMetrics(req, res, next) {
  try {
    const { from, to, timezone } = resolveMetricRange(req.query);
    const data = await catalogMetrics.getCatalogMetrics({ from, to });

    res.json({ data, meta: metricMeta({ from, to, timezone }) });
  } catch (err) {
    next(err);
  }
}

async function getTopCatalog(req, res, next) {
  try {
    const { from, to, timezone } = resolveMetricRange(req.query);

    const limit = req.query.limit ? Number(req.query.limit) : 10;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_RANKING_LIMIT) {
      throw badRequest(
        `limit must be an integer between 1 and ${MAX_RANKING_LIMIT}`,
      );
    }

    const data = await topCatalog.getCatalogRankings({ from, to, limit });

    res.json({ data, meta: metricMeta({ from, to, timezone }) });
  } catch (err) {
    next(err);
  }
}

module.exports = { getMetrics, getTopCatalog };
