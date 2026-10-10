const { parsePagination, paginatedResponse } = require("@reloop/shared");
const buyerAuditService = require("./buyerAuditService");

function requestContext(req) {
  return {
    ipAddress: req.ip,
    userAgent: req.get("user-agent") || null,
  };
}

async function recordOwnActivity(req, res, next) {
  try {
    const result = await buyerAuditService.recordOwnActivity(
      req.userId,
      req.body,
      requestContext(req),
    );
    res.status(result.created ? 201 : 200).json(result.item);
  } catch (err) {
    next(err);
  }
}

async function recordInternalActivity(req, res, next) {
  try {
    const result = await buyerAuditService.recordInternalActivity(
      req.body,
      requestContext(req),
    );
    res.status(result.created ? 201 : 200).json(result.item);
  } catch (err) {
    next(err);
  }
}

async function listOwnActivity(req, res, next) {
  try {
    const pagination = parsePagination(req.query);
    const result = await buyerAuditService.listActivity(req.userId, {
      ...pagination,
      action: req.query.action,
      from: req.query.from,
      to: req.query.to,
    });
    res.json(paginatedResponse(result.items, result.total, pagination));
  } catch (err) {
    next(err);
  }
}

async function listBuyerActivity(req, res, next) {
  try {
    const pagination = parsePagination(req.query);
    const result = await buyerAuditService.listActivity(req.params.buyerId, {
      ...pagination,
      action: req.query.action,
      from: req.query.from,
      to: req.query.to,
    });
    res.json(paginatedResponse(result.items, result.total, pagination));
  } catch (err) {
    next(err);
  }
}

async function listOwnLoginHistory(req, res, next) {
  try {
    const pagination = parsePagination(req.query);
    const result = await buyerAuditService.listLoginHistory(
      req.userId,
      pagination,
    );
    res.json(paginatedResponse(result.items, result.total, pagination));
  } catch (err) {
    next(err);
  }
}

async function listBuyerLoginHistory(req, res, next) {
  try {
    const pagination = parsePagination(req.query);
    const result = await buyerAuditService.listLoginHistory(
      req.params.buyerId,
      pagination,
    );
    res.json(paginatedResponse(result.items, result.total, pagination));
  } catch (err) {
    next(err);
  }
}

module.exports = {
  recordOwnActivity,
  recordInternalActivity,
  listOwnActivity,
  listBuyerActivity,
  listOwnLoginHistory,
  listBuyerLoginHistory,
};
