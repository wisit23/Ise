const { parsePagination, paginatedResponse } = require("@reloop/shared");
const {
  recordExecutiveAudit,
  queryExecutiveAudit,
} = require("./executiveAuditService");

/**
 * Extract actor information from authenticated request or gateway headers.
 */
function extractActor(req) {
  const actorId = req.userId || req.headers["x-user-id"] || req.user?.id;
  const actorRole = req.userRole || req.headers["x-user-role"] || "EXECUTIVE";
  const actorEmail =
    req.userDisplayName || req.headers["x-user-display-name"] || null;
  const ipAddress =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    null;
  const userAgent = req.headers["user-agent"] || null;

  return { actorId, actorRole, actorEmail, ipAddress, userAgent };
}

/**
 * POST /executive/audit
 * Record an executive action log entry.
 */
async function createAuditLog(req, res, next) {
  try {
    const { action, category, targetType, targetId, description, metadata } =
      req.body;
    const actor = extractActor(req);

    const log = await recordExecutiveAudit({
      ...actor,
      action,
      category: category || "GENERAL",
      targetType,
      targetId,
      description,
      metadata,
    });

    res.status(201).json({ status: "ok", data: log });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /executive/audit
 * Query executive audit logs with pagination and filters.
 */
async function getAuditLogs(req, res, next) {
  try {
    const pagination = parsePagination(req.query);
    const { items, total } = await queryExecutiveAudit({
      ...pagination,
      actorId: req.query.actorId,
      action: req.query.action,
      category: req.query.category,
      targetType: req.query.targetType,
      from: req.query.from,
      to: req.query.to,
    });

    const paginated = paginatedResponse(items, total, pagination);
    res.json({
      ...paginated,
      data: items,
      meta: { total, page: pagination.page, limit: pagination.limit },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  extractActor,
  createAuditLog,
  getAuditLogs,
};
