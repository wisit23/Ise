const { Router } = require("express");
const {
  requireAuth,
  requireInternalToken,
  requirePermission,
} = require("@reloop/shared");
const controller = require("./buyerAuditController");

const router = Router();

router.get("/me/login-history", requireAuth, controller.listOwnLoginHistory);
router.get("/me/activity", requireAuth, controller.listOwnActivity);
router.post("/me/activity", requireAuth, controller.recordOwnActivity);

router.get(
  "/admin/buyers/:buyerId/login-history",
  requireAuth,
  requirePermission("admin:audit:read"),
  controller.listBuyerLoginHistory,
);
router.get(
  "/admin/buyers/:buyerId/activity",
  requireAuth,
  requirePermission("admin:audit:read"),
  controller.listBuyerActivity,
);

router.post(
  "/internal/buyer-activity",
  requireInternalToken,
  controller.recordInternalActivity,
);

module.exports = router;
