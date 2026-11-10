const path = require("path");
const multer = require("multer");
const { badRequest, createMediaStorage } = require("@reloop/shared");

const REVIEW_UPLOAD_DIR = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "review-uploads",
);
const reviewStorage = createMediaStorage({ directory: REVIEW_UPLOAD_DIR, namespace: "reviews" });

const ALLOWED_IMAGE_MIME = /^image\/(jpeg|png|x-png|pjpeg|webp|gif)$/i;
const ALLOWED_VIDEO_MIME = /^video\/(mp4|quicktime)$/i;
const ALLOWED_EXT = /\.(jpe?g|png|webp|gif|mp4|mov)$/i;

const storage = reviewStorage.multerStorage(multer);

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

module.exports = { reviewUpload, REVIEW_UPLOAD_DIR, reviewStorage };
