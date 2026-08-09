const { parsePagination, paginatedResponse } = require("@reloop/shared");
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

module.exports = {
  listFeed,
  createClip,
};
