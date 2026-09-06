const { Router } = require("express");
const { requireAuth } = require("@reloop/shared");
const { upload } = require("../middleware/upload");
const uploadController = require("../controllers/uploadController");

const router = Router();

// Upload media for product listings (sellers) or reviews (buyers)
router.post(
  "/",
  requireAuth,
  upload.array("files", 8),
  uploadController.uploadMedia,
);

module.exports = router;
