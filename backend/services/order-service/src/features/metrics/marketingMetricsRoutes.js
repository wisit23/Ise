const { Router } = require("express");
const { requireAuth, requireRole } = require("@reloop/shared");
const marketingMetricsController = require("./marketingMetricsController");

const router = Router();

router.get(
  "/sales-dashboard",
  requireAuth,
  requireRole("MARKETING"),
  marketingMetricsController.getSalesDashboard,
);

module.exports = router;
