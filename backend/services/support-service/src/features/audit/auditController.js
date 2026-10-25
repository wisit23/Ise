const { parsePagination, paginatedResponse } = require("@reloop/shared");
const { queryAudit } = require("./auditQuery");

// HTTP layer for GET /audit. The query lives in auditQuery.js.

async function list(req, res, next) {
  try {
    const pagination = parsePagination(req.query, 20);
    const { items, total } = await queryAudit({
      page: pagination.page,
      limit: pagination.limit,
      actorId: req.query.actorId,
      action: req.query.action,
      targetId: req.query.targetId,
      operationId: req.query.operationId,
      from: req.query.from,
      to: req.query.to,
    });
    res.json(paginatedResponse(items, total, pagination));
  } catch (err) {
    next(err);
  }
}

module.exports = { list };
