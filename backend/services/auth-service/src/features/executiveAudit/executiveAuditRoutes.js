const { Router } = require("express");
const { requireAuth, requireRole } = require("@reloop/shared");
const executiveAuditController = require("./executiveAuditController");

const router = Router();

/**
 * POST /executive/audit
 * Record an executive action log entry.
 */
router.post(
  "/audit",
  requireAuth,
  requireRole("EXECUTIVE"),
  executiveAuditController.createAuditLog,
);

/**
 * GET /executive/audit
 * Query executive audit logs with pagination and filters.
 */
router.get(
  "/audit",
  requireAuth,
  requireRole("EXECUTIVE"),
  executiveAuditController.getAuditLogs,
);

module.exports = router;
