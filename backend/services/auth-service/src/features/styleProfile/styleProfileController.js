const styleProfileService = require("./styleProfileService");

async function get(req, res, next) {
  try {
    res.set("Cache-Control", "private, no-store");
    res.json(await styleProfileService.get(req.userId));
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    res.set("Cache-Control", "private, no-store");
    res.json(await styleProfileService.update(req.userId, req.body));
  } catch (err) {
    next(err);
  }
}

module.exports = { get, update };
