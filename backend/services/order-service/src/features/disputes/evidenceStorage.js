// Private dispute-evidence storage — deliberately NOT product-service's
// uploads/ tree, which the gateway serves publicly at /uploads/ for guests
// (see gateway/src/app.js PUBLIC_PATHS). Evidence for a dispute (photos of
// damaged goods, ID cards, payment slips) must never be reachable without
// authorization, so this lives in its own directory that the gateway never
// proxies as static files — every read goes through evidenceRoutes'
// requireAuth + assertDisputeAccess + audit-logged controller instead.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const { badRequest } = require("@reloop/shared");

const STORAGE_DIR = path.join(__dirname, "..", "..", "..", "private-evidence");
fs.mkdirSync(STORAGE_DIR, { recursive: true });

const ALLOWED_MIME = /^image\/(jpeg|png|webp|gif)$|^video\/(mp4|quicktime)$/;

const storage = multer.diskStorage({
  destination: STORAGE_DIR,
  filename(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024, files: 5 },
  fileFilter(req, file, cb) {
    if (!ALLOWED_MIME.test(file.mimetype)) {
      cb(badRequest(`unsupported file type: ${file.mimetype}`));
      return;
    }
    cb(null, true);
  },
});

function absolutePath(storageKey) {
  // storageKey is always our own crypto.randomUUID()+ext, but resolve+prefix
  // check defensively anyway so a malformed key can never escape STORAGE_DIR.
  const resolved = path.resolve(STORAGE_DIR, storageKey);
  if (!resolved.startsWith(STORAGE_DIR + path.sep)) {
    throw badRequest("invalid evidence key");
  }
  return resolved;
}

module.exports = { STORAGE_DIR, upload, absolutePath };
