const authService = require("../../services/authService");

async function displayNames(req, res, next) {
  try {
    const result = await authService.getDisplayNames(req.body?.userIds);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { displayNames };
