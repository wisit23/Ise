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
  "/top-catalog",
  requireAuth,
  requireRole("EXECUTIVE"),
  metricsController.getTopCatalog,
);

module.exports = router;
