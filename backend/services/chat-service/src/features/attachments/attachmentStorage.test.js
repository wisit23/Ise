const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {
  absolutePath,
  ALLOWED_MIME,
  MAX_FILE_BYTES,
  STORAGE_DIR,
} = require("./attachmentStorage");

test("allows the image/video/pdf types the composer offers", () => {
  for (const mime of [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "video/mp4",
    "video/quicktime",
    "application/pdf",
  ]) {
    assert.equal(ALLOWED_MIME.test(mime), true, `${mime} should be allowed`);
  }
});

test("rejects executable and script types outright", () => {
  for (const mime of [
    "application/x-sh",
    "application/x-msdownload",
    "text/html",
    "application/javascript",
    "application/zip",
    "",
  ]) {
    assert.equal(ALLOWED_MIME.test(mime), false, `${mime} must be rejected`);
  }
});

test("the size cap is 10 MB", () => {
  assert.equal(MAX_FILE_BYTES, 10 * 1024 * 1024);
});

test("absolutePath resolves a normal key inside the storage directory", () => {
  const resolved = absolutePath("abc-123.png");
  assert.equal(resolved, path.join(STORAGE_DIR, "abc-123.png"));
});

test("absolutePath refuses to escape the storage directory", () => {
  // The key is always our own randomUUID in practice, but a traversal
  // attempt must be impossible rather than merely unlikely — this is the
  // guard that makes "look up the key from the message" safe.
  for (const evil of [
    "../../../../etc/passwd",
    "..\\..\\windows\\system32\\config\\sam",
    "subdir/../../escape.txt",
  ]) {
    assert.throws(
      () => absolutePath(evil),
      /invalid attachment key/,
      `${evil} must be rejected`,
    );
  }
});
