const test = require("node:test");
const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const sharp = require("sharp");
const { optimizeListingImage, MAX_IMAGE_BYTES } = require("./listingImage");

for (const format of ["png", "jpeg", "webp", "gif"]) {
  test(`converts ${format} to square WebP without enlarging small images`, async () => {
    const input = await sharp({
      create: { width: 80, height: 140, channels: 3, background: "green" },
    })
      [format]()
      .toBuffer();
    const output = await optimizeListingImage(input);
    const metadata = await sharp(output).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, 80);
    assert.equal(metadata.height, 80);
    assert.ok(output.length <= MAX_IMAGE_BYTES);
  });
}

test("detailed image stays under 500 KB and 1080 pixels", async () => {
  const input = await sharp(randomBytes(1300 * 1200 * 3), {
    raw: { width: 1300, height: 1200, channels: 3 },
  })
    .png()
    .toBuffer();
  assert.ok(input.length > MAX_IMAGE_BYTES);
  const output = await optimizeListingImage(input);
  const metadata = await sharp(output).metadata();
  assert.ok(output.length <= MAX_IMAGE_BYTES);
  assert.equal(metadata.width, metadata.height);
  assert.ok(metadata.width <= 1080);
});

test("orients JPEG before square cropping and removes orientation metadata", async () => {
  const input = await sharp({
    create: { width: 60, height: 120, channels: 3, background: "red" },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
  const metadata = await sharp(await optimizeListingImage(input)).metadata();
  assert.equal(metadata.width, 60);
  assert.equal(metadata.height, 60);
  assert.equal(metadata.orientation, undefined);
});

test("rejects corrupt images instead of returning originals", async () => {
  await assert.rejects(optimizeListingImage(Buffer.from("invalid image")));
});
