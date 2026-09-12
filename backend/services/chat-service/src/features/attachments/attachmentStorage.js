// Private chat-attachment storage — deliberately NOT product-service's
// uploads/ tree, which the gateway serves publicly at /uploads/ for guests
// (see gateway/src/app.js PUBLIC_PATHS). A photo sent inside a private
// conversation must never be readable by anyone who happens to have the
// URL, so this mirrors order-service's private-evidence pattern instead:
// its own directory the gateway never proxies as static files, with every
// read going through requireAuth + a participant check in
// attachmentController.
//
// The file itself never goes into MongoDB — only its storage key lands in
// Message.payload, per plan.md's Global Constraints ("ไฟล์แนบ ห้ามเก็บลง
// ฐานข้อมูล").
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const { badRequest } = require("@reloop/shared");

const STORAGE_DIR = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "private-attachments",
);
fs.mkdirSync(STORAGE_DIR, { recursive: true });

// Same allow-list as the two existing upload paths in this repo. Kept
// narrow on purpose: an attachment is a photo of an item or a receipt, not
// an arbitrary file drop, and every type here is one a browser can render
// or download safely without being offered for execution.
const ALLOWED_MIME =
  /^image\/(jpeg|png|webp|gif)$|^video\/(mp4|quicktime)$|^application\/pdf$/;

const MAX_FILE_BYTES = 10 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: STORAGE_DIR,
  filename(req, file, cb) {
    // The stored name is ours, never the client's — an attacker-supplied
    // originalname could contain path separators or a misleading double
    // extension. The original is kept only as metadata in the payload.
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
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
  // check defensively anyway so a malformed key can never escape STORAGE_DIR
  // (same guard as order-service's evidenceStorage.js).
  const resolved = path.resolve(STORAGE_DIR, storageKey);
  if (!resolved.startsWith(STORAGE_DIR + path.sep)) {
    throw badRequest("invalid attachment key");
  }
  return resolved;
}

module.exports = {
  STORAGE_DIR,
  upload,
  absolutePath,
  ALLOWED_MIME,
  MAX_FILE_BYTES,
};
