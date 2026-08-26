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
router.post("/kyc", requireAuth, authController.submitKyc);
router.get("/kyc/status", requireAuth, authController.getKycStatus);
router.get("/users/:id/public", authController.publicProfile);

// Admin KYC management routes
router.get("/admin/kyc", requireAuth, requireRole("ADMIN"), authController.adminListKyc);
router.get("/admin/kyc/:userId", requireAuth, requireRole("ADMIN"), authController.adminGetKyc);
router.post("/admin/kyc/:userId/approve", requireAuth, requireRole("ADMIN"), authController.adminApproveKyc);
router.post("/admin/kyc/:userId/reject", requireAuth, requireRole("ADMIN"), authController.adminRejectKyc);

module.exports = router;
