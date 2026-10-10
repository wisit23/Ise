// Private KYC-document storage — deliberately not served through any public
// static path. An ID card photo is PII; every read goes through kycRoutes'
// requireAuth + kycService.viewDocument's owner-or-admin check instead. Same
// pattern as order-service's dispute evidenceStorage.js.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const { badRequest, notFound } = require("@reloop/shared");

const STORAGE_DIR = path.resolve(
  process.env.KYC_STORAGE_DIR ||
    path.join(__dirname, "..", "..", "..", "private-kyc-documents"),
);
fs.mkdirSync(STORAGE_DIR, { recursive: true });

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
  await fs.promises.writeFile(absolutePath(storageKey), file.buffer, {
    flag: "wx",
  });
  return storageKey;
}

async function removeDocument(storageKey) {
  if (!storageKey || storageKey === "THAI_ID_METHOD") return;
  try {
    await fs.promises.unlink(absolutePath(storageKey));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function assertDocumentExists(storageKey) {
  const filePath = absolutePath(storageKey);
  try {
    const stat = await fs.promises.stat(filePath);
    if (!stat.isFile()) throw new Error("not a file");
  } catch {
    throw notFound(
      "KYC document file is unavailable; ask the seller to resubmit",
    );
  }
  return filePath;
}

module.exports = {
  STORAGE_DIR,
  upload,
  absolutePath,
  persistDocument,
  removeDocument,
  assertDocumentExists,
};
