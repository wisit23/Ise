const { Router } = require("express");
const { requireAuth } = require("@reloop/shared");
const marketingAuditController = require("./marketingAuditController");

const router = Router();

function requireMarketingAccess(req, res, next) {
  const roles = Array.isArray(req.userRoles)
    ? req.userRoles
    : req.userRole
      ? [req.userRole]
      : [];
  const hasMarketingRole = roles.includes("MARKETING");

  // Only role MARKETING is permitted per MKT-DEC-014 (Marketing domain decoupling).
  // Permissions such as analytics:read:marketing or audit:read:marketing
  // MUST NOT allow other roles (BUYER, SELLER, ADMIN) to bypass.
  if (!hasMarketingRole) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
}

// Only GET is supported. Read-only audit log endpoint for Marketing.
router.get(
  "/",
  requireAuth,
  requireMarketingAccess,
  marketingAuditController.getAuditLogs,
);

module.exports = router;
module.exports.requireMarketingAccess = requireMarketingAccess;
