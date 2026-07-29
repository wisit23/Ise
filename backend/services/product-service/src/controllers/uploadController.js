const { badRequest } = require("@reloop/shared");

function uploadMedia(req, res, next) {
  try {
    if (!req.files || req.files.length === 0) {
      throw badRequest("at least one file is required");
    }

    const media = req.files.map((file) => ({
      url: `/uploads/${file.filename}`,
      type: file.mimetype.startsWith("video/") ? "video" : "image",
    }));
    res.status(201).json({ media });
  } catch (err) {
    next(err);
  }
}

module.exports = { uploadMedia };
