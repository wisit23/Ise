const { Router } = require("express");
const { requireAuth, requirePermission } = require("@reloop/shared");
const auditController = require("./auditController");

const router = Router();

router.get(
  "/",
  requireAuth,
  requirePermission("admin:audit:read"),
  auditController.list,
);

module.exports = router;
