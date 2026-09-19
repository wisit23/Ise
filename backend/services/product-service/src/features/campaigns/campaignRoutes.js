const { Router } = require("express");
const { requireAuth, requireRole, fromGatewayHeaders, verifyAccessToken } = require("@reloop/shared");
const campaignController = require("./campaignController");

const router = Router();

function optionalAuth(req, res, next) {
  fromGatewayHeaders(req, res, () => {
    if (!req.userId && req.headers.authorization) {
      const header = req.headers.authorization;
      const token = header.startsWith("Bearer ") ? header.slice(7) : null;
      if (token) {
        try {
          const payload = verifyAccessToken(token);
          req.userId = payload.sub;
          req.userRole = payload.role;
          req.userRoles = payload.roles || (payload.role ? [payload.role] : []);
        } catch {
          // treat as unauthenticated guest if token is invalid
        }
      }
    }
    next();
  });
}

// Public / Guest routes (browsing active published campaigns)
router.get("/available", optionalAuth, campaignController.listAvailable);
router.get("/published", optionalAuth, campaignController.listAvailable);

// Buyer wallet & smart filter
router.get("/my-vouchers", requireAuth, campaignController.myVouchers);
router.post("/applicable", requireAuth, campaignController.applicable);

// Marketing / Admin list & create
router.get(
  "/",
  requireAuth,
  requireRole("MARKETING"),
  campaignController.list,
);
router.post(
  "/",
  requireAuth,
  requireRole("MARKETING"),
  campaignController.createDraft,
);

// Buyer claiming (hold/release/complete are internal only)
router.post("/:id/claim", requireAuth, campaignController.claim);

// Lifecycle actions (supporting both POST and PATCH for flexibility)
router.post(
  "/:id/submit",
  requireAuth,
  requireRole("MARKETING"),
  campaignController.submitForApproval,
);
router.patch(
  "/:id/submit",
  requireAuth,
  requireRole("MARKETING"),
  campaignController.submitForApproval,
);

router.post(
  "/:id/approve",
  requireAuth,
  requireRole("MARKETING"),
  campaignController.approve,
);
router.patch(
  "/:id/approve",
  requireAuth,
  requireRole("MARKETING"),
  campaignController.approve,
);

router.post(
  "/:id/reject",
  requireAuth,
  requireRole("MARKETING"),
  campaignController.reject,
);
router.patch(
  "/:id/reject",
  requireAuth,
  requireRole("MARKETING"),
  campaignController.reject,
);

router.post(
  "/:id/publish",
  requireAuth,
  requireRole("MARKETING"),
  campaignController.publish,
);
router.patch(
  "/:id/publish",
  requireAuth,
  requireRole("MARKETING"),
  campaignController.publish,
);

router.post(
  "/:id/end",
  requireAuth,
  requireRole("MARKETING"),
  campaignController.end,
);
router.patch(
  "/:id/end",
  requireAuth,
  requireRole("MARKETING"),
  campaignController.end,
);

// Marketing Campaign Metrics & Analytics (Tasks 8 & 9)
router.get(
  "/metrics/overview",
  requireAuth,
  requireRole("MARKETING"),
  campaignController.getOverviewMetrics,
);
router.get(
  "/metrics/trends",
  requireAuth,
  requireRole("MARKETING"),
  campaignController.getSalesTrends,
);
router.get(
  "/metrics/compare",
  requireAuth,
  requireRole("MARKETING"),
  campaignController.getCampaignComparison,
);
router.get(
  "/:id/metrics",
  requireAuth,
  requireRole("MARKETING"),
  campaignController.getCampaignMetrics,
);

// Single campaign detail & edit
router.get("/:id", optionalAuth, campaignController.getOne);
router.patch(
  "/:id",
  requireAuth,
  requireRole("MARKETING"),
  campaignController.updateDraft,
);
router.delete(
  "/:id",
  requireAuth,
  requireRole("MARKETING"),
  campaignController.deleteDraft,
);

module.exports = router;
