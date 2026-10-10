const { badRequest } = require("@reloop/shared");

function uploadReviewMedia(req, res, next) {
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
    next(err);
  }
}

module.exports = { uploadReviewMedia };
