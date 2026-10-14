const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const multer = require("multer");
const { badRequest, notFound } = require("@reloop/shared");

const STORAGE_DIR = path.resolve(process.env.REPORT_EVIDENCE_STORAGE_DIR ||
  path.join(__dirname, "..", "..", "..", "private-kyc-documents", "report-evidence"));
fs.mkdirSync(STORAGE_DIR, { recursive: true });

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
  await fs.promises.writeFile(absolutePath(storageKey), file.buffer, { flag: "wx" });
  return storageKey;
}

async function remove(storageKey) {
  if (!storageKey) return;
  try { await fs.promises.unlink(absolutePath(storageKey)); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
}

async function readablePath(storageKey) {
  const filePath = absolutePath(storageKey);
  try { if (!(await fs.promises.stat(filePath)).isFile()) throw new Error("not a file"); }
  catch { throw notFound("report evidence file is unavailable"); }
  return filePath;
}

module.exports = { upload, persist, remove, readablePath };
