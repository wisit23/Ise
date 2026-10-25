const sharp = require("sharp");

const MAX_IMAGE_BYTES = 500000;
const MAX_IMAGE_SIDE = 1080;

async function optimizeListingImage(input) {
  const image = sharp(input, { limitInputPixels: 64000000 }).rotate();
  const metadata = await image.metadata();
  if (!["jpeg", "png", "webp", "gif"].includes(metadata.format)) {
    throw new Error("unsupported image format");
  }
  let side = Math.min(MAX_IMAGE_SIDE, metadata.width, metadata.height);
  while (side >= 1) {
    const { data, info } = await image
      .clone()
      .resize(side, side, {
        fit: "cover",
        position: "centre",
        fastShrinkOnLoad: false,
      })
      .raw()
      .toBuffer({ resolveWithObject: true });
    // Every attempt encodes from the same pixels, avoiding repeated lossy compression.
    const encode = (quality) =>
      sharp(data, { raw: info })
        .webp({ quality, effort: 6, smartSubsample: true })
        .toBuffer();
    const best = await encode(95);
    if (best.length <= MAX_IMAGE_BYTES) return best;
    let low = 75;
    let high = 94;
    let candidate;
    while (low <= high) {
      const quality = Math.floor((low + high) / 2);
      const buffer = await encode(quality);
      if (buffer.length <= MAX_IMAGE_BYTES) {
        candidate = buffer;
        low = quality + 1;
      } else high = quality - 1;
    }
    if (candidate) return candidate;
    // Preserve compression quality; reduce dimensions only when necessary.
    side = Math.floor(side * 0.85);
  }
  throw new Error("image cannot fit the upload limit");
}

module.exports = { optimizeListingImage, MAX_IMAGE_BYTES, MAX_IMAGE_SIDE };
