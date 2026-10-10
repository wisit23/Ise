const { badRequest } = require("@reloop/shared");

function uploadMedia(req, res, next) {
  try {
    if (!req.files || req.files.length === 0) {
      throw badRequest("at least one file is required");
    }

    const media = req.files.map((file) => {
      const isVideo =
        (file.mimetype && file.mimetype.toLowerCase().startsWith("video/")) ||
        /\.(mp4|mov)$/i.test(file.filename);
      return {
        url: `/uploads/${file.filename}`,
        type: isVideo ? "video" : "image",
      };
    });
    res.status(201).json({ media });
  } catch (err) {
    next(err);
  }
}

module.exports = { uploadMedia };
