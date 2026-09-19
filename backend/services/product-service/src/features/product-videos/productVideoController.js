const {
  badRequest,
  parsePagination,
  paginatedResponse,
} = require("@reloop/shared");
const productVideoService = require("./productVideoService");

async function listFeed(req, res, next) {
  try {
    const pagination = parsePagination(req.query, 10);
    const { items, total } = await productVideoService.listFeed({
      skip: pagination.skip,
      take: pagination.take,
    });

    res.json(paginatedResponse(items, total, pagination));
  } catch (err) {
    next(err);
  }
}

function uploadClip(req, res, next) {
  try {
    if (!req.file) throw badRequest("video file is required");

    res.status(201).json({
      media: [
        {
          url: `/uploads/${req.file.filename}`,
          type: "video",
        },
      ],
    });
  } catch (err) {
    next(err);
  }
}

async function createClip(req, res, next) {
  try {
    const clip = await productVideoService.createClip({
      user: {
        id: req.userId,
        role: req.userRole,
        displayName: req.userDisplayName,
      },
      input: req.body,
    });

    res.status(201).json(clip);
  } catch (err) {
    next(err);
  }
}

async function chooseClip(req, res, next) {
  try {
    const choice = await productVideoService.chooseClip({
      user: { id: req.userId, role: req.userRole },
      productVideoId: req.params.id,
    });
    res.status(201).json(choice);
  } catch (err) {
    next(err);
  }
}

async function unchooseClip(req, res, next) {
  try {
    const result = await productVideoService.unchooseClip({
      user: { id: req.userId, role: req.userRole },
      productVideoId: req.params.id,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listFeed,
  uploadClip,
  createClip,
  chooseClip,
  unchooseClip,
};
