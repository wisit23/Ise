const test = require("node:test");
const assert = require("node:assert/strict");

// Requiring the service pulls in prismaClient, which needs a URL present
// (it never connects here — only the pure helpers below are exercised).
process.env.DATABASE_URL ||= "mongodb://placeholder:27017/placeholder";

const { messageTypeFor, previewFor } = require("./attachmentService");

test("images are typed IMAGE so the client renders them inline", () => {
  for (const mime of ["image/png", "image/jpeg", "image/webp", "image/gif"]) {
    assert.equal(messageTypeFor(mime), "IMAGE");
  }
});

test("everything else is typed FILE so the client offers a download", () => {
  for (const mime of ["application/pdf", "video/mp4", "video/quicktime"]) {
    assert.equal(messageTypeFor(mime), "FILE");
  }
});

test("an image preview reads as a photo, not a raw type tag", () => {
  // This string lands in Conversation.lastMessagePreview and is shown
  // verbatim in the inbox, so "[IMAGE]" would leak an internal enum into
  // the UI.
  assert.equal(previewFor("IMAGE", "anything.png"), "📷 รูปภาพ");
});

test("a file preview names the file so the inbox row is meaningful", () => {
  assert.equal(previewFor("FILE", "receipt.pdf"), "📎 receipt.pdf");
});
