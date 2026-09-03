// Seller-facing KYC submission — mounted at "/kyc" (→ /api/auth/kyc through
// the gateway). Admin's review side lives separately at adminKycRoutes.js
// ("/admin/kyc"), reusing the same KycApplication/SellerProfile rows.
const { Router } = require("express");
const { requireAuth } = require("@reloop/shared");
const kycController = require("./kycController");

const router = Router();

router.use(requireAuth);

router.post("/", kycController.submit);
router.get("/mine", kycController.mine);
router.get("/:applicationId/document", kycController.viewDocument);

module.exports = router;
