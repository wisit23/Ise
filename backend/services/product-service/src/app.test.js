const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const request = require("supertest");
const sharp = require("sharp");

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
const adminToken = signAccessToken({ sub: "admin-1", role: "ADMIN" });
const customerServiceToken = signAccessToken({
  sub: "customer-service-1",
  role: "CUSTOMER_SERVICE",
});
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

for (const [role, token] of [
  ["EXECUTIVE", executiveToken],
  ["ADMIN", adminToken],
  ["CUSTOMER_SERVICE", customerServiceToken],
]) {
  test(`POST /campaigns/:id/claim rejects ${role} before touching the database`, async () => {
    const res = await request(app)
      .post("/campaigns/campaign-1/claim")
      .set("Authorization", `Bearer ${token}`);

    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, "CUSTOMER_ACCOUNT_REQUIRED");
  });
}

test("POST /uploads with no bearer token is rejected with 401", async () => {
  const res = await request(app).post("/uploads");
  assert.equal(res.status, 401);
});

test("POST /uploads converts seller PNG images to square WebP within all limits", async () => {
  const fakePngBuffer = await sharp({
    create: { width: 2000, height: 1200, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  const res = await request(app)
    .post("/uploads")
    .set("Authorization", `Bearer ${sellerToken}`)
    .attach("files", fakePngBuffer, "test-image.png");

  assert.equal(res.status, 201);
  assert.ok(Array.isArray(res.body.media));
  assert.equal(res.body.media.length, 1);
  assert.equal(res.body.media[0].type, "image");
  assert.ok(res.body.media[0].url.endsWith(".webp"));
  const output = fs.readFileSync(
    path.join(UPLOAD_DIR, path.basename(res.body.media[0].url)),
  );
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 1080);
  assert.equal(metadata.height, 1080);
  assert.ok(output.length <= 500000);
  removeUploadedMedia(res.body.media[0].url);
});

test("POST /uploads rejects corrupt images and cleans a partially processed batch", async () => {
  const before = new Set(fs.readdirSync(UPLOAD_DIR));
  const valid = await sharp({
    create: { width: 10, height: 20, channels: 3, background: "blue" },
  })
    .png()
    .toBuffer();
  const res = await request(app)
    .post("/uploads")
    .set("Authorization", `Bearer ${sellerToken}`)
    .attach("files", valid, "valid.png")
    .attach("files", Buffer.from("invalid image"), "broken.jpg");
  assert.equal(res.status, 400);
  assert.deepEqual(new Set(fs.readdirSync(UPLOAD_DIR)), before);
});

test("normal listing video passes through without image conversion", async () => {
  const clip = fs.readFileSync(
    path.join(__dirname, "../test/fixtures/video/long.mp4"),
  );
  const res = await request(app)
    .post("/uploads")
    .set("Authorization", `Bearer ${sellerToken}`)
    .attach("files", clip, { filename: "clip.mp4", contentType: "video/mp4" });
  assert.equal(res.status, 201);
  assert.equal(res.body.media[0].type, "video");
  assert.deepEqual(
    fs.readFileSync(
      path.join(UPLOAD_DIR, path.basename(res.body.media[0].url)),
    ),
    clip,
  );
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
    .attach(
      "video",
      fs.readFileSync(path.join(__dirname, "../test/fixtures/video/limit.mp4")),
      {
        filename: "seller-clip.mp4",
        contentType: "video/mp4",
      },
    );

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

for (const [endpoint, field] of [["/videos/upload", "video"]]) {
  for (const [filename, expected] of [
    ["long.mp4", "60"],
    ["wide.mp4", "1080"],
  ]) {
    test(`${endpoint} rejects ${filename} and removes the rejected file`, async () => {
      const before = new Set(fs.readdirSync(UPLOAD_DIR));
      const res = await request(app)
        .post(endpoint)
        .set("Authorization", `Bearer ${sellerToken}`)
        .attach(
          field,
          fs.readFileSync(
            path.join(__dirname, "../test/fixtures/video", filename),
          ),
          filename,
        );
      assert.equal(res.status, 400);
      assert.match(res.body.error, new RegExp(expected));
      assert.deepEqual(new Set(fs.readdirSync(UPLOAD_DIR)), before);
    });
  }
  const megabytes = 100;
  test(`${endpoint} accepts a valid ${megabytes} MB MOV`, async () => {
    const clip = fs.readFileSync(
      path.join(__dirname, "../test/fixtures/video/portrait.mov"),
    );
    const padded = Buffer.alloc(megabytes * 1024 * 1024);
    clip.copy(padded);
    const res = await request(app)
      .post(endpoint)
      .set("Authorization", `Bearer ${sellerToken}`)
      .attach(field, padded, {
        filename: "portrait.mov",
        contentType: "video/quicktime",
      });
    assert.equal(res.status, 201);
    assert.equal(res.body.media[0].type, "video");
    removeUploadedMedia(res.body.media[0].url);
  });
  test(`${endpoint} rejects corrupt video bytes and cleans up`, async () => {
    const before = new Set(fs.readdirSync(UPLOAD_DIR));
    const res = await request(app)
      .post(endpoint)
      .set("Authorization", `Bearer ${sellerToken}`)
      .attach(field, Buffer.from("not a clip"), {
        filename: "broken.mp4",
        contentType: "video/mp4",
      });
    assert.equal(res.status, 400);
    assert.deepEqual(new Set(fs.readdirSync(UPLOAD_DIR)), before);
  });
}

test("video upload rejects files larger than 100 MB with a client error", async () => {
  const before = new Set(fs.readdirSync(UPLOAD_DIR));
  const res = await request(app)
    .post("/videos/upload")
    .set("Authorization", `Bearer ${sellerToken}`)
    .attach("video", Buffer.alloc(100 * 1024 * 1024 + 1), {
      filename: "large.mp4",
      contentType: "video/mp4",
    });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /100 MB/);
  assert.deepEqual(new Set(fs.readdirSync(UPLOAD_DIR)), before);
});
