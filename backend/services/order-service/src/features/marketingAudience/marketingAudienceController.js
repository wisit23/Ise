const service = require("./marketingAudienceService");

async function listPurchases(req, res, next) {
  try {
    res.set("Cache-Control", "private, no-store");
    res.json(await service.listPurchases(req.query));
  } catch (error) {
    next(error);
  }
}

module.exports = { listPurchases };
