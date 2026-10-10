const { Router } = require("express");
const { requireAuth } = require("@reloop/shared");
const marketingMetricsController = require("./marketingMetricsController");

const router = Router();

function requireMarketingAccess(req, res, next) {
  const roles = req.userRoles || (req.userRole ? [req.userRole] : []);
  const hasMarketingRole = roles.includes("MARKETING");
  const hasMarketingPermission = req.permissions?.includes(
    "analytics:read:marketing",
  );

  if (!hasMarketingRole && !hasMarketingPermission) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
}

router.get(
  "/analytics/user-usage",
  requireAuth,
  requireMarketingAccess,
  marketingMetricsController.getUserAnalytics,
);

module.exports = router;
module.exports.requireMarketingAccess = requireMarketingAccess;
