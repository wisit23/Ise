const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {
  validateListingVideo,
  validateVideoMetadata,
  MAX_VIDEO_BYTES,
} = require("./listingVideo");

const metadata = (duration = "60", width = 1080, height = 1080) => ({
  format: { duration },
  streams: [{ codec_type: "video", width, height, duration }],
});

test("accepts exact duration and resolution limits and rectangular clips", () => {
  assert.doesNotThrow(() => validateVideoMetadata(metadata()));
  assert.doesNotThrow(() => validateVideoMetadata(metadata("30", 1080, 720)));
  assert.doesNotThrow(() => validateVideoMetadata(metadata("30", 720, 1080)));
});

test("rejects clips longer than 60 seconds including additional streams", () => {
  assert.throws(() => validateVideoMetadata(metadata("60.001")), /60/);
  const value = metadata();
  value.streams.push({ codec_type: "audio", duration: "61" });
  assert.throws(() => validateVideoMetadata(value), /60/);
});

test("rejects either dimension above 1080", () => {
  assert.throws(
    () => validateVideoMetadata(metadata("30", 1920, 1080)),
    /1080/,
  );
  assert.throws(
    () => validateVideoMetadata(metadata("30", 1080, 1920)),
    /1080/,
  );
});

test("rejects unknown metadata and audio-only files", () => {
  for (const value of [
    {},
    metadata("N/A"),
    metadata("0"),
    metadata("1", 0, 720),
    { format: { duration: "10" }, streams: [{ codec_type: "audio" }] },
  ]) {
    assert.throws(() => validateVideoMetadata(value));
  }
});

test("rejects files above 100 MB before probing and rejects corrupt clips", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "listing-video-"));
  const filePath = path.join(dir, "clip.mp4");
  try {
    await fs.writeFile(filePath, "invalid clip");
    await assert.rejects(validateListingVideo({ path: filePath }), /MP4/);
    await fs.truncate(filePath, MAX_VIDEO_BYTES + 1);
    await assert.rejects(validateListingVideo({ path: filePath }), /100 MB/);
  } finally {
    await fs.rm(filePath, { force: true });
    await fs.rmdir(dir);
  }
});
