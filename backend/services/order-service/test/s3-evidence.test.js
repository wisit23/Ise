const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");
const { S3Client } = require("@aws-sdk/client-s3");
const { createFakeS3 } = require("../../../shared/test/fakeS3");
process.env.MEDIA_STORAGE_DRIVER = "s3";
process.env.AWS_REGION = "ap-southeast-1";
process.env.S3_BUCKET = "private-evidence-tests";
process.env.S3_KEY_PREFIX = "orders";
const fake = createFakeS3();
const originalSend = S3Client.prototype.send;
S3Client.prototype.send = (command) => fake.send(command);
test.after(() => { S3Client.prototype.send = originalSend; });
let evidence;
const audits = [];
function stub(modulePath, exports) {
  const filename = require.resolve(modulePath);
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
}
stub("../src/models/prismaClient", {});
stub("../src/models/orderModel", { findById: async () => ({ buyerId: "buyer", sellerId: "seller" }) });
stub("../src/features/disputes/disputeModel", {
  findById: async () => ({ id: "dispute", orderId: "order", status: "OPEN", version: 1 }),
  findEvidence: async () => evidence,
  addEvidence: async (input) => { evidence = { id: "evidence", ...input }; return evidence; },
  auditLog: async (input) => audits.push(input),
});
const { errorHandler } = require("@reloop/shared");
const { evidenceStorage } = require("../src/features/disputes/evidenceStorage");
const controller = require("../src/features/disputes/disputeController");
const app = express();
app.use((req, res, next) => { req.userId = req.get("x-test-user") || "stranger"; req.userRole = "BUYER"; next(); });
app.post("/:id/evidence", controller.uploadEvidence);
app.get("/:id/evidence/:evidenceId", controller.viewEvidence);
app.use(errorHandler);

test("S3 evidence keeps access checks and view/missing audit records", async () => {
  const uploaded = await request(app).post("/dispute/evidence").set("x-test-user", "buyer")
    .attach("file", Buffer.from("private evidence"), "evidence.png");
  assert.equal(uploaded.status, 201);
  const url = "/dispute/evidence/evidence";
  const calls = fake.calls.length;
  assert.equal((await request(app).get(url).set("x-test-user", "stranger")).status, 403);
  assert.equal(fake.calls.length, calls);
  const read = await request(app).get(url).set("x-test-user", "buyer");
  assert.equal(read.status, 200);
  assert.deepEqual(read.body, Buffer.from("private evidence"));
  assert.ok(audits.some((audit) => audit.action === "VIEW_EVIDENCE"));
  await evidenceStorage.remove(evidence.storageKey);
  assert.equal((await request(app).get(url).set("x-test-user", "buyer")).status, 404);
  assert.ok(audits.some((audit) => audit.action === "EVIDENCE_MISSING"));
});

test("S3 evidence rejected upload does not leave an object behind", async () => {
  const before = new Set(fake.objects.keys());
  const rejected = await request(app).post("/dispute/evidence").set("x-test-user", "stranger")
    .attach("file", Buffer.from("rejected evidence"), "bad.png");
  assert.equal(rejected.status, 403);
  assert.deepEqual(new Set(fake.objects.keys()), before);
});
