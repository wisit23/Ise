const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const request = require("supertest");

process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
process.env.DATABASE_URL ||=
  "postgresql://placeholder:placeholder@localhost:5432/placeholder";

const { signAccessToken } = require("@reloop/shared");
const { UPLOAD_DIR } = require("./middleware/upload");
const app = require("./app");
// This feature suite uses signed identity fixtures; live session enforcement
// is covered separately by account-suspension.integration.test.js.
app.locals.validateAccessSession = async () => {};

const buyerToken = signAccessToken({ sub: "buyer-1", role: "BUYER" });
const executiveToken = signAccessToken({ sub: "exec-1", role: "EXECUTIVE" });
const sellerToken = signAccessToken({ sub: "seller-1", role: "SELLER" });

function removeUploadedMedia(url) {
  fs.rmSync(path.join(UPLOAD_DIR, path.basename(url)), { force: true });
}

test("GET /health returns 200 ok without needing a database", async () => {
  const res = await request(app).get("/health");
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "ok");
  assert.equal(res.body.service, "product-service");
});

test("POST / with no bearer token is rejected with 401", async () => {
  const res = await request(app)
    .post("/")
    .send({ title: "x", price: 100, category: "y" });
  assert.equal(res.status, 401);
});

test("POST / from a BUYER account is rejected with 403 before touching the database", async () => {
  const res = await request(app)
    .post("/")
    .set("Authorization", `Bearer ${buyerToken}`)
    .send({ title: "x", price: 100, category: "y" });
  assert.equal(res.status, 403);
});

test("POST /videos with no bearer token is rejected with 401", async () => {
  const res = await request(app)
    .post("/videos")
    .send({ videoUrl: "https://example.test/a.mp4", productId: "p1" });
  assert.equal(res.status, 401);
});

test("POST /videos from a BUYER account is rejected with 403 before touching the database", async () => {
  const res = await request(app)
    .post("/videos")
    .set("Authorization", `Bearer ${buyerToken}`)
    .send({ videoUrl: "https://example.test/a.mp4", productId: "p1" });
  assert.equal(res.status, 403);
});

test("POST /auctions/:id/bids from a staff account is rejected before touching the database", async () => {
  const res = await request(app)
    .post("/auctions/auction-1/bids")
    .set("Authorization", `Bearer ${executiveToken}`)
    .send({ amount: 100, idempotencyKey: "staff-bid" });
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, "CUSTOMER_ACCOUNT_REQUIRED");
});

test("POST /uploads with no bearer token is rejected with 401", async () => {
  const res = await request(app).post("/uploads");
  assert.equal(res.status, 401);
});

test("POST /uploads allows SELLER to upload PNG images", async () => {
  const fakePngBuffer = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  );
  const res = await request(app)
    .post("/uploads")
    .set("Authorization", `Bearer ${sellerToken}`)
    .attach("files", fakePngBuffer, "test-image.png");

  assert.equal(res.status, 201);
  assert.ok(Array.isArray(res.body.media));
  assert.equal(res.body.media.length, 1);
  assert.equal(res.body.media[0].type, "image");
  assert.ok(res.body.media[0].url.endsWith(".png"));
  removeUploadedMedia(res.body.media[0].url);
});

test("POST /videos/upload rejects non-video files", async () => {
  const res = await request(app)
    .post("/videos/upload")
    .set("Authorization", `Bearer ${sellerToken}`)
    .attach("video", Buffer.from("not-a-video"), {
      filename: "image.png",
      contentType: "image/png",
    });

  assert.equal(res.status, 400);
});

test("POST /videos/upload stores a swipe clip in product-service uploads", async () => {
  const res = await request(app)
    .post("/videos/upload")
    .set("Authorization", `Bearer ${sellerToken}`)
    .attach("video", Buffer.from("fake-mp4-content"), {
      filename: "seller-clip.mp4",
      contentType: "video/mp4",
    });

  assert.equal(res.status, 201);
  assert.equal(res.body.media.length, 1);
  assert.equal(res.body.media[0].type, "video");
  assert.match(res.body.media[0].url, /^\/uploads\/[0-9a-f-]+\.mp4$/);

  const storedPath = path.join(
    UPLOAD_DIR,
    path.basename(res.body.media[0].url),
  );
  assert.equal(fs.existsSync(storedPath), true);
  removeUploadedMedia(res.body.media[0].url);
});
