const marketingAuditService = require("./marketingAuditService");

/**
 * Controller for Marketing Audit Trail API.
 * Read-only interface for Marketing role.
 */
async function getAuditLogs(req, res, next) {
  try {
    const result = await marketingAuditService.getAuditLogs(req.query);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAuditLogs,
};
