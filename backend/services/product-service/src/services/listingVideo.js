const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const fs = require("node:fs/promises");
const { badRequest } = require("@reloop/shared");

const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const MAX_VIDEO_SECONDS = 60;
const MAX_VIDEO_SIDE = 1080;
const run = promisify(execFile);

function validateVideoMetadata(metadata) {
  const streams = metadata.streams || [];
  const videoStreams = streams.filter(
    (stream) => stream.codec_type === "video",
  );
  const duration = Number(metadata.format?.duration);
  if (!videoStreams.length || !Number.isFinite(duration) || duration <= 0) {
    throw badRequest("ไม่สามารถอ่านความยาวหรือความละเอียดของคลิปได้");
  }
  if (
    duration > MAX_VIDEO_SECONDS ||
    streams.some((stream) => Number(stream.duration) > MAX_VIDEO_SECONDS)
  ) {
    throw badRequest("คลิปต้องยาวไม่เกิน 60 วินาที");
  }
  for (const stream of videoStreams) {
    if (
      !Number.isInteger(stream.width) ||
      !Number.isInteger(stream.height) ||
      stream.width <= 0 ||
      stream.height <= 0
    ) {
      throw badRequest("ไม่สามารถอ่านความละเอียดของคลิปได้");
    }
    if (stream.width > MAX_VIDEO_SIDE || stream.height > MAX_VIDEO_SIDE) {
      throw badRequest(
        "คลิปต้องมีความกว้างและความสูงไม่เกิน 1080 × 1080 พิกเซล",
      );
    }
  }
}

async function validateListingVideo(file) {
  if ((await fs.stat(file.path)).size > MAX_VIDEO_BYTES) {
    throw badRequest("คลิปต้องมีขนาดไม่เกิน 100 MB");
  }
  let metadata;
  try {
    // Alpine uses the maintained system package; Windows development uses a bundled binary.
    const executable =
      process.env.FFPROBE_PATH ||
      (process.platform === "win32"
        ? require("ffprobe-static").path
        : "ffprobe");
    const { stdout } = await run(
      executable,
      [
        "-v",
        "error",
        "-protocol_whitelist",
        "file",
        "-format_whitelist",
        "mov",
        "-show_entries",
        "format=duration:stream=codec_type,width,height,duration",
        "-of",
        "json",
        file.path,
      ],
      { timeout: 15000, maxBuffer: 1024 * 1024, windowsHide: true },
    );
    metadata = JSON.parse(stdout);
  } catch (err) {
    if (err.code === "ENOENT")
      throw new Error("FFprobe is required to validate video uploads");
    throw badRequest(
      "ไม่สามารถอ่านคลิปได้ กรุณาใช้ไฟล์ MP4 หรือ MOV ที่สมบูรณ์",
    );
  }
  validateVideoMetadata(metadata);
}

module.exports = {
  validateListingVideo,
  validateVideoMetadata,
  MAX_VIDEO_BYTES,
};
