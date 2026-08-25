const { Router } = require("express");
const { requireAuth, requireRole } = require("@reloop/shared");
const metricsController = require("./metricsController");

const router = Router();

router.get(
  "/metrics",
  requireAuth,
  requireRole("EXECUTIVE"),
  metricsController.getMetrics,
);

router.get(
  "/metrics-series",
  requireAuth,
  requireRole("EXECUTIVE"),
  metricsController.getMetricsSeries,
);

module.exports = router;
