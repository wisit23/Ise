const {
  customerServiceClientConfig: { evidence },
} = require("@reloop/shared");
// Private dispute-evidence storage — deliberately NOT product-service's
// uploads/ tree, which the gateway serves publicly at /uploads/ for guests
// (see gateway/src/app.js PUBLIC_PATHS). Evidence for a dispute (photos of
// damaged goods, ID cards, payment slips) must never be reachable without
// authorization, so this uses its own directory / S3 namespace that is never
// exposed as static files — every read goes through evidenceRoutes'
// requireAuth + assertDisputeAccess + audit-logged controller instead.
const path = require("path");
const multer = require("multer");
const { badRequest, createMediaStorage } = require("@reloop/shared");

const STORAGE_DIR = path.join(__dirname, "..", "..", "..", "private-evidence");
const evidenceStorage = createMediaStorage({ directory: STORAGE_DIR, namespace: "dispute-evidence" });

const ALLOWED_MIME = new Set(evidence.mimeTypes);

const storage = evidenceStorage.multerStorage(multer);

const upload = multer({
  storage,
  limits: { fileSize: evidence.maxFileBytes, files: evidence.maxFiles },
  fileFilter(req, file, cb) {
    if (!ALLOWED_MIME.has(file.mimetype)) {
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

module.exports = { STORAGE_DIR, upload, absolutePath, evidenceStorage };
