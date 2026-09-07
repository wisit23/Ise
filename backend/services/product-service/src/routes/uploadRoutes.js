const { Router } = require("express");
const { requireAuth } = require("@reloop/shared");
const { upload } = require("../middleware/upload");
const uploadController = require("../controllers/uploadController");

const router = Router();

// Product listing images and seller video clips only. Review media is owned
// by review-service and uploaded through /api/reviews/uploads.
router.post(
  "/",
  requireAuth,
  upload.array("files", 8),
  uploadController.uploadMedia,
);

module.exports = router;
