const { Router } = require("express");
const {
  requireAuth,
  requireRole,
  requireInternalToken,
} = require("@reloop/shared");
const metricsController = require("./metricsController");
const { searchSellers } = require("./executiveSellerSearch");

const router = Router();

router.post("/seller-search", requireInternalToken, searchSellers);

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

router.get(
  "/reports",
  requireAuth,
  requireRole("EXECUTIVE"),
  metricsController.getReports,
);

module.exports = router;
