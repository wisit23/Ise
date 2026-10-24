const {
  badRequest,
  parsePagination,
  paginatedResponse,
} = require("@reloop/shared");
const productVideoService = require("./productVideoService");

function sellerUser(req) {
  return { id: req.userId, role: req.userRole };
}

async function listMine(req, res, next) {
  try {
    const pagination = parsePagination(req.query, 12);
    const { items, total } = await productVideoService.listMine({
      user: sellerUser(req),
      skip: pagination.skip,
      take: pagination.take,
    });
    res.json(paginatedResponse(items, total, pagination));
  } catch (err) {
    next(err);
  }
}

async function updateClip(req, res, next) {
  try {
    res.json(
      await productVideoService.updateClip({
        user: sellerUser(req),
        id: req.params.id,
        input: req.body,
      }),
    );
  } catch (err) {
    next(err);
  }
}

async function deleteClip(req, res, next) {
  try {
    res.json(
      await productVideoService.deleteClip({
        user: sellerUser(req),
        id: req.params.id,
      }),
    );
  } catch (err) {
    next(err);
  }
}

async function listFeed(req, res, next) {
  try {
    const pagination = parsePagination(req.query, 10);
    const { items, total } = await productVideoService.listFeed({
      skip: pagination.skip,
      take: pagination.take,
      userId: req.userId || null,
      ...(typeof req.query.videoId === "string" && req.query.videoId
        ? { videoId: req.query.videoId }
        : {}),
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
      user: {
        id: req.userId,
        role: req.userRole,
        roles: req.userRoles,
        status: req.accountStatus,
        displayName: req.userDisplayName,
      },
      productVideoId: req.params.id,
    });
    res.status(200).json(choice);
  } catch (err) {
    next(err);
  }
}

async function unchooseClip(req, res, next) {
  try {
    const result = await productVideoService.unchooseClip({
      user: {
        id: req.userId,
        role: req.userRole,
        roles: req.userRoles,
        status: req.accountStatus,
        displayName: req.userDisplayName,
      },
      productVideoId: req.params.id,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function createComment(req, res, next) {
  try {
    const comment = await productVideoService.createComment({
      user: {
        id: req.userId,
        role: req.userRole,
        roles: req.userRoles,
        status: req.accountStatus,
        displayName: req.userDisplayName,
      },
      productVideoId: req.params.id,
      input: req.body,
    });
    res.status(201).json(comment);
  } catch (err) {
    next(err);
  }
}

async function listComments(req, res, next) {
  try {
    const comments = await productVideoService.listComments(req.params.id);
    res.json(comments);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listMine,
  updateClip,
  deleteClip,
  listFeed,
  uploadClip,
  createClip,
  chooseClip,
  unchooseClip,
  createComment,
  listComments,
};
