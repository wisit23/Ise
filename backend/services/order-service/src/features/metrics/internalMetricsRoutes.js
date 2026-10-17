const { Router } = require("express");
const {
  requireInternalToken,
  resolveMetricRange,
  metricMeta,
} = require("@reloop/shared");
const productSalesMetrics = require("./productSalesMetrics");

const router = Router();

// Called by product-service to rank categories and products from the same
// orders the dashboard's GMV is summed from. Service-to-service only.
router.get("/product-sales", requireInternalToken, async (req, res, next) => {
  try {
    const { from, to, timezone } = resolveMetricRange(req.query);
    const data = await productSalesMetrics.getProductSales({ from, to });

    res.json({ data, meta: metricMeta({ from, to, timezone }) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
