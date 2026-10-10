const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const { badRequest } = require("@reloop/shared");

const REVIEW_UPLOAD_DIR = path.join(__dirname, "..", "..", "uploads");
fs.mkdirSync(REVIEW_UPLOAD_DIR, { recursive: true });

const ALLOWED_IMAGE_MIME = /^image\/(jpeg|png|x-png|pjpeg|webp|gif)$/i;
const ALLOWED_VIDEO_MIME = /^video\/(mp4|quicktime)$/i;
const ALLOWED_EXT = /\.(jpe?g|png|webp|gif|mp4|mov)$/i;

const storage = multer.diskStorage({
  destination: REVIEW_UPLOAD_DIR,
  filename(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const reviewUpload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024, files: 5 },
  fileFilter(req, file, cb) {
    const isMimeAllowed =
      ALLOWED_IMAGE_MIME.test(file.mimetype) ||
      ALLOWED_VIDEO_MIME.test(file.mimetype);
    const isExtensionAllowed = ALLOWED_EXT.test(file.originalname);
    if (!isMimeAllowed || !isExtensionAllowed) {
      cb(badRequest(`unsupported review media type: ${file.mimetype}`));
      return;
    }
    cb(null, true);
  },
});

module.exports = { reviewUpload, REVIEW_UPLOAD_DIR };
