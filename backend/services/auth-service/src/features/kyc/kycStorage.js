// Private KYC-document storage — deliberately not served through any public
// static path. An ID card photo is PII; every read goes through kycRoutes'
// requireAuth + kycService.viewDocument's owner-or-admin check instead. Same
// pattern as order-service's dispute evidenceStorage.js.
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const { badRequest, notFound, createMediaStorage, isMissingMedia } = require("@reloop/shared");

const STORAGE_DIR = path.resolve(
  process.env.KYC_STORAGE_DIR ||
    path.join(__dirname, "..", "..", "..", "private-kyc-documents"),
);
const documentStorage = createMediaStorage({ directory: STORAGE_DIR, namespace: "kyc-documents" });

const ALLOWED_MIME = /^image\/(jpeg|png|webp)$/;

const upload = multer({
  // Hold the single, bounded file in memory until business validation passes.
  // submitKyc persists it immediately before the DB transaction and removes it
  // if that transaction fails, avoiding multer-created orphan files.
  storage: multer.memoryStorage(),
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

async function persistDocument(file) {
  if (!file?.buffer) throw badRequest("document file is invalid");
  const ext = path.extname(file.originalname || "").toLowerCase();
  const storageKey = `${crypto.randomUUID()}${ext}`;
  await documentStorage.put(storageKey, file.buffer, file.mimetype);
  return storageKey;
}

async function removeDocument(storageKey) {
  if (!storageKey || storageKey === "THAI_ID_METHOD") return;
  await documentStorage.remove(storageKey);
}

async function assertDocumentExists(storageKey) {
  const filePath = absolutePath(storageKey);
  try {
    await documentStorage.assertExists(storageKey);
  } catch (error) {
    if (!isMissingMedia(error) && error.status !== 404) throw error;
    throw notFound(
      "KYC document file is unavailable; ask the seller to resubmit",
    );
  }
  return filePath;
}

module.exports = {
  STORAGE_DIR,
  documentStorage,
  upload,
  absolutePath,
  persistDocument,
  removeDocument,
  assertDocumentExists,
};
