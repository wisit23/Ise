const { badRequest } = require("@reloop/shared");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { optimizeListingImage } = require("../services/listingImage");

async function uploadMedia(req, res, next) {
  const createdPaths = [];
  try {
    if (!req.files || req.files.length === 0) {
      throw badRequest("at least one file is required");
    }

    const media = [];
    for (const file of req.files) {
      const isVideo =
        /^video\/(mp4|quicktime)$/i.test(file.mimetype) &&
        /\.(mp4|mov)$/i.test(file.filename);
      let filename = file.filename;
      if (!isVideo) {
        let buffer;
        try {
          buffer = await optimizeListingImage(await fs.readFile(file.path));
        } catch {
          throw badRequest(
            "ประมวลผลรูปภาพไม่สำเร็จ กรุณาใช้ไฟล์ JPEG, PNG, WebP หรือ GIF ที่สมบูรณ์ (ไม่เกิน 64 ล้านพิกเซล)",
          );
        }
        filename = `${crypto.randomUUID()}.webp`;
        const outputPath = path.join(path.dirname(file.path), filename);
        createdPaths.push(outputPath);
        await fs.writeFile(outputPath, buffer, { flag: "wx" });
        await fs.unlink(file.path);
      }
      media.push({
        url: `/uploads/${filename}`,
        type: isVideo ? "video" : "image",
      });
    }
    res.status(201).json({ media });
  } catch (err) {
    await Promise.allSettled([
      ...(req.files || []).map((file) => fs.rm(file.path, { force: true })),
      ...createdPaths.map((filePath) => fs.rm(filePath, { force: true })),
    ]);
    next(err);
  }
}

module.exports = { uploadMedia };
