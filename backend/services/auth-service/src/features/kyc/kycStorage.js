// Private KYC-document storage — deliberately not served through any public
// static path. An ID card photo is PII; every read goes through kycRoutes'
// requireAuth + kycService.viewDocument's owner-or-admin check instead. Same
// pattern as order-service's dispute evidenceStorage.js.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const { badRequest } = require("@reloop/shared");

const STORAGE_DIR = path.join(__dirname, "..", "..", "..", "private-kyc-documents");
fs.mkdirSync(STORAGE_DIR, { recursive: true });

const ALLOWED_MIME = /^image\/(jpeg|png|webp)$/;

const storage = multer.diskStorage({
  destination: STORAGE_DIR,
  filename(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter(req, file, cb) {
    if (!ALLOWED_MIME.test(file.mimetype)) {
      cb(badRequest(`unsupported file type: ${file.mimetype}`));
      return;
    }
    cb(null, true);
  },
});

function absolutePath(storageKey) {
  const resolved = path.resolve(STORAGE_DIR, storageKey);
  if (!resolved.startsWith(STORAGE_DIR + path.sep)) {
    throw badRequest("invalid document key");
  }
  return resolved;
}

module.exports = { STORAGE_DIR, upload, absolutePath };
