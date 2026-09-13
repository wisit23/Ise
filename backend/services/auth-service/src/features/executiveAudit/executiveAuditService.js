const prisma = require("../../models/prismaClient");

const MAX_AUDIT_LIMIT = 100;
const DEFAULT_AUDIT_LIMIT = 20;

const AUDIT_CATEGORIES = {
  GENERAL: "GENERAL",
  DATA_EXPORT: "DATA_EXPORT",
  FINANCIAL: "FINANCIAL",
  RISK_AUDIT: "RISK_AUDIT",
};

/**
 * Record an append-only executive audit log entry.
 *
 * @param {Object} entry
 * @param {string} entry.actorId - User ID of the executive performing the action
 * @param {string} [entry.actorEmail] - Email or display name of the actor
 * @param {string} [entry.actorRole] - Role of the actor (defaults to EXECUTIVE)
 * @param {string} entry.action - Machine-readable action code (e.g., REPORT_EXPORT_CSV)
 * @param {string} [entry.category] - Category of action (GENERAL, DATA_EXPORT, etc.)
 * @param {string} [entry.targetType] - Target entity type (e.g., report, user, order)
 * @param {string} [entry.targetId] - Target entity identifier
 * @param {string} entry.description - Human-readable explanation of what was done
 * @param {Object} [entry.metadata] - Optional arbitrary structured payload
 * @param {string} [entry.ipAddress] - Client IP address
 * @param {string} [entry.userAgent] - Client user-agent string
 */
async function recordExecutiveAudit({
  actorId,
  actorEmail,
  actorRole = "EXECUTIVE",
  action,
  category = AUDIT_CATEGORIES.GENERAL,
  targetType,
  targetId,
  description,
  metadata,
  ipAddress,
  userAgent,
}) {
  if (!actorId || !action || !description) {
    throw new Error(
      "actorId, action, and description are required for executive audit log",
    );
  }

  return prisma.executiveAuditLog.create({
    data: {
      actorId,
      actorEmail: actorEmail || null,
      actorRole: actorRole || "EXECUTIVE",
      action,
      category,
      targetType: targetType || null,
      targetId: targetId || null,
      description,
      metadata: metadata || null,
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
    },
  });
}

/**
 * Build safe date filter for Prisma query.
 */
function buildDateRangeFilter(from, to) {
  const filter = {};
  if (from) {
    const fromDate = new Date(from);
    if (!isNaN(fromDate.getTime())) {
      filter.gte = fromDate;
    }
  }
  if (to) {
    const toDate = new Date(to);
    if (!isNaN(toDate.getTime())) {
      filter.lte = toDate;
    }
  }
  return Object.keys(filter).length > 0 ? filter : undefined;
}

/**
 * Query executive audit logs with pagination and filters.
 */
async function queryExecutiveAudit({
  page = 1,
  limit = DEFAULT_AUDIT_LIMIT,
  actorId,
  action,
  category,
  targetType,
  from,
  to,
}) {
  const safePage = Math.max(Number(page) || 1, 1);
  const safeLimit = Math.min(
    Math.max(Number(limit) || DEFAULT_AUDIT_LIMIT, 1),
    MAX_AUDIT_LIMIT,
  );

  const createdAt = buildDateRangeFilter(from, to);

  const where = {
    ...(actorId ? { actorId } : {}),
    ...(action ? { action } : {}),
    ...(category ? { category } : {}),
    ...(targetType ? { targetType } : {}),
    ...(createdAt ? { createdAt } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.executiveAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    }),
    prisma.executiveAuditLog.count({ where }),
  ]);

  return { items, total };
}

module.exports = {
  recordExecutiveAudit,
  queryExecutiveAudit,
  AUDIT_CATEGORIES,
  MAX_AUDIT_LIMIT,
  DEFAULT_AUDIT_LIMIT,
};
