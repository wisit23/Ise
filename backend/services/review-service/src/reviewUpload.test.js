const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const request = require("supertest");

process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
process.env.DATABASE_URL ||=
  "postgresql://placeholder:placeholder@localhost:5432/placeholder";

const { signAccessToken } = require("@reloop/shared");
const { REVIEW_UPLOAD_DIR } = require("./middleware/upload");
const app = require("./app");

const buyerToken = signAccessToken({ sub: "buyer-1", role: "BUYER" });

test("POST /uploads rejects unauthenticated review media uploads", async () => {
  const res = await request(app).post("/uploads");
  assert.equal(res.status, 401);
});

test("review media is stored and served by review-service", async (t) => {
  const fakePngBuffer = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  );

  const uploadResponse = await request(app)
    .post("/uploads")
    .set("Authorization", `Bearer ${buyerToken}`)
    .attach("files", fakePngBuffer, "review-image.png");

  assert.equal(uploadResponse.status, 201);
  assert.equal(uploadResponse.body.media.length, 1);
  assert.equal(uploadResponse.body.media[0].type, "image");
  assert.match(
    uploadResponse.body.media[0].url,
    /^\/review-uploads\/[0-9a-f-]+\.png$/,
  );

  const filename = path.basename(uploadResponse.body.media[0].url);
  const storedPath = path.join(REVIEW_UPLOAD_DIR, filename);
  t.after(() => fs.rmSync(storedPath, { force: true }));

  assert.equal(fs.existsSync(storedPath), true);

  const downloadResponse = await request(app).get(
    uploadResponse.body.media[0].url,
  );
  assert.equal(downloadResponse.status, 200);
  assert.deepEqual(downloadResponse.body, fakePngBuffer);
});
