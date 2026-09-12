const { Router } = require("express");
const { requireAuth, requireRole } = require("@reloop/shared");
const campaignController = require("./campaignController");

const router = Router();

// Public / Guest routes (browsing active published campaigns)
router.get("/available", campaignController.listAvailable);
router.get("/published", campaignController.listAvailable);

// Buyer wallet & smart filter
router.get("/my-vouchers", requireAuth, campaignController.myVouchers);
router.post("/applicable", requireAuth, campaignController.applicable);

// Marketing / Admin list & create
router.get(
  "/",
  requireAuth,
  requireRole("MARKETING", "ADMIN"),
  campaignController.list,
);
router.post(
  "/",
  requireAuth,
  requireRole("MARKETING", "ADMIN"),
  campaignController.createDraft,
);

// Buyer claiming & voucher hold/release/complete
router.post("/:id/claim", requireAuth, campaignController.claim);
router.post("/:id/hold", requireAuth, campaignController.hold);
router.post("/:id/release", requireAuth, campaignController.release);
router.post("/:id/complete", requireAuth, campaignController.complete);

// Lifecycle actions (supporting both POST and PATCH for flexibility)
router.post(
  "/:id/submit",
  requireAuth,
  requireRole("MARKETING", "ADMIN"),
  campaignController.submitForApproval,
);
router.patch(
  "/:id/submit",
  requireAuth,
  requireRole("MARKETING", "ADMIN"),
  campaignController.submitForApproval,
);

router.post(
  "/:id/approve",
  requireAuth,
  requireRole("MARKETING", "ADMIN"),
  campaignController.approve,
);
router.patch(
  "/:id/approve",
  requireAuth,
  requireRole("MARKETING", "ADMIN"),
  campaignController.approve,
);

router.post(
  "/:id/reject",
  requireAuth,
  requireRole("MARKETING", "ADMIN"),
  campaignController.reject,
);
router.patch(
  "/:id/reject",
  requireAuth,
  requireRole("MARKETING", "ADMIN"),
  campaignController.reject,
);

router.post(
  "/:id/publish",
  requireAuth,
  requireRole("MARKETING", "ADMIN"),
  campaignController.publish,
);
router.patch(
  "/:id/publish",
  requireAuth,
  requireRole("MARKETING", "ADMIN"),
  campaignController.publish,
);

router.post(
  "/:id/end",
  requireAuth,
  requireRole("MARKETING", "ADMIN"),
  campaignController.end,
);
router.patch(
  "/:id/end",
  requireAuth,
  requireRole("MARKETING", "ADMIN"),
  campaignController.end,
);

// Single campaign detail & edit
router.get("/:id", campaignController.getOne);
router.patch(
  "/:id",
  requireAuth,
  requireRole("MARKETING", "ADMIN"),
  campaignController.updateDraft,
);
router.delete(
  "/:id",
  requireAuth,
  requireRole("MARKETING", "ADMIN"),
  campaignController.deleteDraft,
);

module.exports = router;
