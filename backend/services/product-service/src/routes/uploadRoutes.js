const { Router } = require("express");
const { requireAuth, requireRole } = require("@reloop/shared");
const { upload } = require("../middleware/upload");
const uploadController = require("../controllers/uploadController");

const router = Router();

// Product listing images and seller video clips only. Review media is owned
// by the review uploader in product-service through /api/reviews/uploads.
router.post(
  "/",
  requireAuth,
  requireRole("SELLER", "MARKETING"),
  upload.array("files", 8),
  uploadController.uploadMedia,
);

module.exports = router;
