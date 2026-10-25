const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const { badRequest } = require("@reloop/shared");
const { MAX_VIDEO_BYTES } = require("../services/listingVideo");

const UPLOAD_DIR = path.join(__dirname, "..", "..", "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME = /^image\/(jpeg|png|x-png|pjpeg|webp|gif)$/i;
const ALLOWED_VIDEO_MIME = /^video\/(mp4|quicktime)$/i;
const ALLOWED_EXT = /\.(jpe?g|png|webp|gif|mp4|mov)$/i;
const ALLOWED_VIDEO_EXT = /\.(mp4|mov)$/i;

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024, files: 8 },
  fileFilter(req, file, cb) {
    const isMimeOk =
      ALLOWED_MIME.test(file.mimetype) ||
      ALLOWED_VIDEO_MIME.test(file.mimetype);
    const isExtOk = ALLOWED_EXT.test(file.originalname);
    if (!isMimeOk && !isExtOk) {
      cb(badRequest(`unsupported file type: ${file.mimetype}`));
      return;
    }
    cb(null, true);
  },
});

const videoUpload = multer({
  storage,
  // Busboy emits its limit event at equality; validation enforces <=100 MB.
  limits: { fileSize: MAX_VIDEO_BYTES + 1, files: 1 },
  fileFilter(req, file, cb) {
    if (
      !ALLOWED_VIDEO_MIME.test(file.mimetype) ||
      !ALLOWED_VIDEO_EXT.test(file.originalname)
    ) {
      cb(badRequest("only MP4 and MOV video files are supported"));
      return;
    }
    cb(null, true);
  },
});

function handleUploadError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    return next(
      badRequest(
        err.code === "LIMIT_FILE_SIZE"
          ? "ไฟล์ต้องมีขนาดไม่เกิน 100 MB"
          : "จำนวนไฟล์หรือรูปแบบการอัปโหลดไม่ถูกต้อง",
      ),
    );
  }
  next(err);
}

module.exports = { upload, videoUpload, UPLOAD_DIR, handleUploadError };
