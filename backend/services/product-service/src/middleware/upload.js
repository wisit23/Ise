const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const { badRequest } = require("@reloop/shared");

const UPLOAD_DIR = path.join(__dirname, "..", "..", "uploads");

const ALLOWED_MIME = /^image\/(jpeg|png|webp|gif)$|^video\/(mp4|quicktime)$/;

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
    if (!ALLOWED_MIME.test(file.mimetype)) {
      cb(badRequest(`unsupported file type: ${file.mimetype}`));
      return;
    }
    cb(null, true);
  },
});

module.exports = { upload, UPLOAD_DIR };
