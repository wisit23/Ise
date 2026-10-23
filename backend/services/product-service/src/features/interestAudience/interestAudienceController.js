const service = require("./interestAudienceService");

async function options(req, res, next) {
  try {
    res.set("Cache-Control", "private, no-store");
    res.json(await service.options());
  } catch (error) {
    next(error);
  }
}

async function preview(req, res, next) {
  try {
    res.set("Cache-Control", "private, no-store");
    res.json(await service.preview(req.body || {}));
  } catch (error) {
    next(error);
  }
}

async function insights(req, res, next) {
  try {
    res.set("Cache-Control", "private, no-store");
    res.json(await service.insights(req.query || {}));
  } catch (error) {
    next(error);
  }
}

module.exports = { options, preview, insights };
