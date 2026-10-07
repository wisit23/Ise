const activityMetrics = require("./activityMetrics");

async function getUserAnalytics(req, res, next) {
  try {
    const data = await activityMetrics.getUserUsageAnalytics(req.query);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getUserAnalytics,
};
