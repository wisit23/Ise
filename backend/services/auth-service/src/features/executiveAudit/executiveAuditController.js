const { parsePagination, paginatedResponse } = require("@reloop/shared");
const {
  recordExecutiveAudit,
  queryExecutiveAudit,
} = require("./executiveAuditService");
const { buildAuditEntry } = require("./executiveAuditPolicy");

/**
 * Who is acting, from the verified access token only. requireAuth has already
 * checked the token, so these come from it and never from request headers a
 * client could set; the email is read from the users table when recording.
 */
function extractActor(req) {
  const ipAddress =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    null;
  const userAgent = req.headers["user-agent"] || null;

  return {
    actorId: req.userId,
    actorRole: req.userRole,
    ipAddress,
    userAgent,
  };
}

/**
 * POST /executive/audit
 * Record an executive action log entry. The browser names the action and the
 * facts; the server decides the category, wording and what is kept.
 */
async function createAuditLog(req, res, next) {
  try {
    const entry = buildAuditEntry(req.body);
    const log = await recordExecutiveAudit({ ...extractActor(req), ...entry });

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
