const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const express = require("express");
const request = require("supertest");
const { S3Client } = require("@aws-sdk/client-s3");
const { createFakeS3 } = require("../../../../../shared/test/fakeS3");
process.env.MEDIA_STORAGE_DRIVER = "s3";
process.env.AWS_REGION = "ap-southeast-1";
process.env.S3_BUCKET = "private-chat-tests";
process.env.S3_KEY_PREFIX = "chat";
const fake = createFakeS3();
const originalSend = S3Client.prototype.send;
S3Client.prototype.send = (command) => fake.send(command);
test.after(() => { S3Client.prototype.send = originalSend; });
const messages = new Map();
function stub(modulePath, exports) {
  const filename = require.resolve(modulePath);
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
}
stub("../../models/prismaClient", {
  conversation: { findUnique: async () => ({ id: "conversation", contextType: "PRODUCT", status: "OPEN",
    participants: [{ userId: "member", role: "BUYER" }] }) },
  message: { findFirst: async ({ where }) => {
    const message = messages.get(where.id);
    return message?.conversationId === where.conversationId ? message : null;
  } },
});
stub("../messages/messageModel", { createAndTouch: async (input) => {
  const message = { id: `msg-${messages.size}`, ...input };
  messages.set(message.id, message);
  return message;
} });
stub("../../realtime/broadcast", { broadcastMessage: () => {} });
const { errorHandler } = require("@reloop/shared");
const { attachmentStorage } = require("./attachmentStorage");
const controller = require("./attachmentController");
const app = express();
app.use((req, res, next) => { req.userId = req.get("x-test-user") || "stranger"; next(); });
app.post("/:id/attachments", controller.send);
app.get("/:id/attachments/:messageId", controller.download);
app.get("/internal/:id/attachments/:messageId", require("../internal/internalController").getAttachment);
app.use(errorHandler);

test("S3 chat file upload/read stays participant-only, denied uploads are removed", async () => {
  const scratch = new Set(await fs.readdir(attachmentStorage.uploadDirectory));
  const uploaded = await request(app).post("/conversation/attachments").set("x-test-user", "member")
    .attach("file", Buffer.from("private chat image"), "photo.png");
  assert.equal(uploaded.status, 201);
  const url = `/conversation/attachments/${uploaded.body.id}`;
  const calls = fake.calls.length;
  const denied = await request(app).get(url).set("x-test-user", "stranger");
  assert.equal(denied.status, 403);
  assert.equal(fake.calls.length, calls);
  const allowed = await request(app).get(url).set("x-test-user", "member");
  assert.equal(allowed.status, 200);
  assert.deepEqual(allowed.body, Buffer.from("private chat image"));
  const internal = await request(app).get(`/internal${url}`);
  assert.equal(internal.status, 200);
  assert.deepEqual(internal.body, allowed.body);
  assert.ok([...fake.objects.keys()].every((key) => key.startsWith("private-chat-tests/chat/chat-attachments/")));
  const objects = new Set(fake.objects.keys());
  const rejected = await request(app).post("/conversation/attachments").set("x-test-user", "stranger")
    .attach("file", Buffer.from("must be removed"), "secret.png");
  assert.equal(rejected.status, 403);
  assert.deepEqual(new Set(fake.objects.keys()), objects);
  assert.deepEqual(new Set(await fs.readdir(attachmentStorage.uploadDirectory)), scratch);
});
