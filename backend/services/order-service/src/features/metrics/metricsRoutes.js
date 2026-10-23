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

router.get(
  "/order-status",
  requireAuth,
  requireRole("EXECUTIVE"),
  metricsController.getOrderStatus,
);

router.get(
  "/first-sale",
  requireAuth,
  requireRole("EXECUTIVE"),
  metricsController.getFirstSale,
);

router.get(
  "/disputes",
  requireAuth,
  requireRole("EXECUTIVE"),
  metricsController.getDisputes,
);

router.get(
  "/disputes/:id",
  requireAuth,
  requireRole("EXECUTIVE"),
  metricsController.getDispute,
);

module.exports = router;
