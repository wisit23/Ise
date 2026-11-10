const path = require("node:path");
const crypto = require("node:crypto");
const multer = require("multer");
const { badRequest, notFound, createMediaStorage, isMissingMedia } = require("@reloop/shared");

const STORAGE_DIR = path.resolve(process.env.REPORT_EVIDENCE_STORAGE_DIR ||
  path.join(__dirname, "..", "..", "..", "private-kyc-documents", "report-evidence"));
const reportStorage = createMediaStorage({ directory: STORAGE_DIR, namespace: "report-evidence" });

const EXTENSIONS = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter(req, file, cb) {
    if (!EXTENSIONS[file.mimetype]) return cb(badRequest("report evidence must be a JPEG, PNG or WebP image"));
    cb(null, true);
  },
});

function absolutePath(storageKey) {
  const resolved = path.resolve(STORAGE_DIR, storageKey);
  if (!resolved.startsWith(STORAGE_DIR + path.sep)) throw badRequest("invalid evidence key");
  return resolved;
}

async function persist(file) {
  const storageKey = `${crypto.randomUUID()}${EXTENSIONS[file.mimetype]}`;
  await reportStorage.put(storageKey, file.buffer, file.mimetype);
  return storageKey;
}

async function remove(storageKey) {
  if (!storageKey) return;
  await reportStorage.remove(storageKey);
}

async function readablePath(storageKey) {
  const filePath = absolutePath(storageKey);
  try { await reportStorage.assertExists(storageKey); }
  catch (error) {
    if (!isMissingMedia(error) && error.status !== 404) throw error;
    throw notFound("report evidence file is unavailable");
  }
  return filePath;
}

module.exports = { upload, persist, remove, readablePath, reportStorage };
