const service = require("./marketingAudienceService");

async function listBuyerProfiles(req, res, next) {
  try {
    res.set("Cache-Control", "private, no-store");
    res.json(await service.listBuyerProfiles(req.query));
  } catch (error) {
    next(error);
  }
}

module.exports = { listBuyerProfiles };
