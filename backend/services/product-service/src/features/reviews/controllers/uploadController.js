const { badRequest } = require("@reloop/shared");
const { reviewStorage } = require("../middleware/upload");

async function uploadReviewMedia(req, res, next) {
  try {
    if (!req.files || req.files.length === 0) {
      throw badRequest("at least one review media file is required");
    }

    const media = req.files.map((file) => ({
      url: `/review-uploads/${file.filename}`,
      type: file.mimetype.toLowerCase().startsWith("video/")
        ? "video"
        : "image",
    }));

    res.status(201).json({ media });
  } catch (err) {
    await Promise.allSettled((req.files || []).map((file) => reviewStorage.discardUpload(file)));
    next(err);
  }
}

module.exports = { uploadReviewMedia };
