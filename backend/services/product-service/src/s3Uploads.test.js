const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const request = require("supertest");
const sharp = require("sharp");
const { S3Client } = require("@aws-sdk/client-s3");
const { createFakeS3 } = require("../../../shared/test/fakeS3");

// Node's test runner isolates this file from the default-Docker suites.
process.env.MEDIA_STORAGE_DRIVER = "s3";
process.env.AWS_REGION = "ap-southeast-1";
process.env.S3_BUCKET = "private-media-tests";
process.env.S3_KEY_PREFIX = "consumer";
process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
process.env.DATABASE_URL ||= "postgresql://placeholder:placeholder@localhost:5432/placeholder";
const fake = createFakeS3();
const originalSend = S3Client.prototype.send;
S3Client.prototype.send = (command) => fake.send(command);
test.after(() => { S3Client.prototype.send = originalSend; });
const { signAccessToken } = require("@reloop/shared");
const { mediaStorage } = require("./middleware/upload");
const { reviewStorage } = require("./features/reviews/middleware/upload");
const app = require("./app");
app.locals.validateAccessSession = async () => {};
const seller = signAccessToken({ sub: "seller-s3", role: "SELLER" });
const buyer = signAccessToken({ sub: "buyer-s3", role: "BUYER" });
const keyFor = (url) => `private-media-tests/consumer/${url.startsWith("/uploads/") ? "products" : "reviews"}/${path.basename(url)}`;

async function scratch(storage) { return new Set(await fs.readdir(storage.uploadDirectory)); }

test("S3 seller image upload converts WebP, preserves URL and serves bytes without auth", async () => {
  const before = await scratch(mediaStorage);
  const image = await sharp({ create: { width: 80, height: 60, channels: 3, background: "red" } }).png().toBuffer();
  const uploaded = await request(app).post("/uploads").set("Authorization", `Bearer ${seller}`)
    .attach("files", image, "photo.png");
  assert.equal(uploaded.status, 201);
  const url = uploaded.body.media[0].url;
  assert.match(url, /^\/uploads\/[\da-f-]+\.webp$/);
  const stored = fake.objects.get(keyFor(url));
  assert.equal(stored.type, "image/webp");
  assert.equal((await sharp(stored.body).metadata()).format, "webp");
  const read = await request(app).get(url);
  assert.equal(read.status, 200);
  assert.deepEqual(read.body, stored.body);
  assert.deepEqual(await scratch(mediaStorage), before);
});

test("S3 image batch with a corrupt file rolls back earlier objects and scratch", async () => {
  const beforeObjects = new Set(fake.objects.keys());
  const beforeScratch = await scratch(mediaStorage);
  const image = await sharp({ create: { width: 20, height: 20, channels: 3, background: "blue" } }).png().toBuffer();
  const result = await request(app).post("/uploads").set("Authorization", `Bearer ${seller}`)
    .attach("files", image, "valid.png").attach("files", Buffer.from("broken"), "invalid.png");
  assert.equal(result.status, 400);
  assert.deepEqual(new Set(fake.objects.keys()), beforeObjects);
  assert.deepEqual(await scratch(mediaStorage), beforeScratch);
});

test("S3 review upload retains auth, serves media and cleans rejected multipart", async () => {
  const before = await scratch(reviewStorage);
  const unauthorized = await request(app).post("/reviews/uploads").attach("files", Buffer.from("x"), "photo.png");
  assert.equal(unauthorized.status, 401);
  const uploaded = await request(app).post("/reviews/uploads").set("Authorization", `Bearer ${buyer}`)
    .attach("files", Buffer.from("review image"), "photo.png");
  assert.equal(uploaded.status, 201);
  const url = uploaded.body.media[0].url;
  assert.ok(fake.objects.has(keyFor(url)));
  assert.equal((await request(app).get(url)).status, 200);
  const objectsBefore = new Set(fake.objects.keys());
  const rejected = await request(app).post("/reviews/uploads").set("Authorization", `Bearer ${buyer}`)
    .attach("files", Buffer.from("ok"), "one.png")
    .attach("files", Buffer.from("bad"), { filename: "bad.exe", contentType: "application/octet-stream" });
  assert.equal(rejected.status, 400);
  assert.deepEqual(new Set(fake.objects.keys()), objectsBefore);
  assert.deepEqual(await scratch(reviewStorage), before);
});

test("S3 video is validated, persisted and readable with byte ranges", async () => {
  const before = await scratch(mediaStorage);
  const video = await fs.readFile(path.join(__dirname, "../test/fixtures/video/limit.mp4"));
  const uploaded = await request(app).post("/videos/upload").set("Authorization", `Bearer ${seller}`)
    .attach("video", video, { filename: "clip.mp4", contentType: "video/mp4" });
  assert.equal(uploaded.status, 201);
  const url = uploaded.body.media[0].url;
  assert.deepEqual(fake.objects.get(keyFor(url)).body, video);
  const ranged = await request(app).get(url).set("Range", "bytes=0-15");
  assert.equal(ranged.status, 206);
  assert.deepEqual(ranged.body, video.subarray(0, 16));
  const rejected = await request(app).post("/videos/upload").set("Authorization", `Bearer ${seller}`)
    .attach("video", Buffer.from("not a movie"), { filename: "bad.mp4", contentType: "video/mp4" });
  assert.equal(rejected.status, 400);
  assert.deepEqual(await scratch(mediaStorage), before);
});

test("S3 upload failure responds with error, never a successful local fallback", async () => {
  const before = await scratch(mediaStorage);
  const objectsBefore = new Set(fake.objects.keys());
  fake.failPut = true;
  try {
    const image = await sharp({ create: { width: 20, height: 20, channels: 3, background: "red" } }).png().toBuffer();
    const result = await request(app).post("/uploads").set("Authorization", `Bearer ${seller}`)
      .attach("files", image, "fail.png");
    assert.equal(result.status, 500);
    assert.deepEqual(new Set(fake.objects.keys()), objectsBefore);
    assert.deepEqual(await scratch(mediaStorage), before);
  } finally { fake.failPut = false; }
});
