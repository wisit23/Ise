const { Router } = require("express");
const { requireAuth, requireRole } = require("@reloop/shared");
const { upload } = require("../middleware/upload");
const uploadController = require("../controllers/uploadController");

const router = Router();

router.post(
  "/",
  requireAuth,
  requireRole("SELLER", "ADMIN"),
  upload.array("files", 8),
  uploadController.uploadMedia,
);

module.exports = router;
