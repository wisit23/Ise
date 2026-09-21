const { Router } = require("express");
const { requireAuth, requireRole } = require("@reloop/shared");
const authController = require("../controllers/authController");

const router = Router();

router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/refresh", authController.refresh);
router.post("/logout", authController.logout);
router.get("/me", requireAuth, authController.me);
router.patch("/me", requireAuth, authController.updateMe);
router.get("/users/:id/public", authController.publicProfile);

// ── Shop change-request (seller: submit + view history) ────────────────────
router.get(
  "/shop/profile",
  requireAuth,
  requireRole("SELLER"),
  authController.getMyShopProfile,
);
router.post(
  "/shop/change-request",
  requireAuth,
  requireRole("SELLER"),
  authController.submitShopChangeRequest,
);
router.get(
  "/shop/change-requests",
  requireAuth,
  requireRole("SELLER"),
  authController.getMyChangeRequests,
);

// ── Shop change-request (admin: review queue + decide) ─────────────────────
router.get(
  "/admin/shop/change-requests",
  requireAuth,
  requireRole("ADMIN"),
  authController.getPendingChangeRequests,
);
router.patch(
  "/admin/shop/change-requests/:id/decide",
  requireAuth,
  requireRole("ADMIN"),
  authController.decideChangeRequest,
);

module.exports = router;
