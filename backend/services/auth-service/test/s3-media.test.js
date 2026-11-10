const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");
const { S3Client } = require("@aws-sdk/client-s3");
const { createFakeS3 } = require("../../../shared/test/fakeS3");
process.env.MEDIA_STORAGE_DRIVER = "s3";
process.env.AWS_REGION = "ap-southeast-1";
process.env.S3_BUCKET = "private-auth-tests";
process.env.S3_KEY_PREFIX = "auth";
const fake = createFakeS3();
const originalSend = S3Client.prototype.send;
S3Client.prototype.send = (command) => fake.send(command);
test.after(() => { S3Client.prototype.send = originalSend; });
let documentKey;
let auditCount = 0;
const prismaPath = require.resolve("../src/models/prismaClient");
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: {
  $transaction: async () => { throw new Error("database unavailable"); },
  kycApplication: { findUnique: async () => ({ userId: "owner", storageKey: documentKey, fileType: "image/png" }) },
  adminAudit: { create: async () => { auditCount++; } },
} };
const { errorHandler } = require("@reloop/shared");
const storage = require("../src/features/kyc/kycStorage");
const service = require("../src/features/kyc/kycService");
const controller = require("../src/features/kyc/kycController");
const reports = require("../src/features/reports/reportEvidenceStorage");
const app = express();
app.get("/document", (req, res, next) => {
  req.userId = req.get("x-test-user") || "stranger";
  req.permissions = [];
  next();
}, controller.viewDocument);
app.use(errorHandler);
const bytes = Buffer.from("private ID document");
const file = { buffer: bytes, originalname: "id.png", mimetype: "image/png" };

test("KYC S3 reads stay owner-authorized and audited; private object is streamed", async () => {
  documentKey = await storage.persistDocument(file);
  assert.ok(fake.objects.has(`private-auth-tests/auth/kyc-documents/${documentKey}`));
  const beforeCalls = fake.calls.length;
  const denied = await request(app).get("/document").set("x-test-user", "stranger");
  assert.equal(denied.status, 403);
  assert.equal(fake.calls.length, beforeCalls);
  assert.equal(auditCount, 0);
  const allowed = await request(app).get("/document").set("x-test-user", "owner");
  assert.equal(allowed.status, 200);
  assert.deepEqual(allowed.body, bytes);
  assert.equal(auditCount, 1);
  await storage.removeDocument(documentKey);
  const missing = await request(app).get("/document").set("x-test-user", "owner");
  assert.equal(missing.status, 404);
});

test("KYC DB failure rolls back newly uploaded S3 document", async () => {
  const before = new Set(fake.objects.keys());
  await assert.rejects(service.submitKyc({ userId: "owner", shopName: "shop", idCardNumber: "1234567890123",
    address: "Bangkok", file }), /database unavailable/);
  assert.deepEqual(new Set(fake.objects.keys()), before);
});

test("report evidence uses a separate private S3 namespace and supports removal", async () => {
  const key = await reports.persist(file);
  assert.ok(fake.objects.has(`private-auth-tests/auth/report-evidence/${key}`));
  await reports.readablePath(key);
  await reports.remove(key);
  await assert.rejects(reports.readablePath(key), (error) => error.status === 404);
});

test("S3 access denied is not misreported as a missing KYC/report file", async () => {
  const original = fake.send;
  fake.send = async () => { throw Object.assign(new Error("AccessDenied"), { $metadata: { httpStatusCode: 403 } }); };
  try {
    await assert.rejects(storage.assertDocumentExists("denied.png"), /AccessDenied/);
    await assert.rejects(reports.readablePath("denied.png"), /AccessDenied/);
  } finally { fake.send = original; }
});
