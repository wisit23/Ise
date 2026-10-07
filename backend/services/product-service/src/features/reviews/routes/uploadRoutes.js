const { Router } = require("express");
const { requireAuth } = require("@reloop/shared");
const { reviewUpload } = require("../middleware/upload");
const uploadController = require("../controllers/uploadController");

const router = Router();

router.post(
  "/",
  requireAuth,
  reviewUpload.array("files", 5),
  uploadController.uploadReviewMedia,
);

module.exports = router;
