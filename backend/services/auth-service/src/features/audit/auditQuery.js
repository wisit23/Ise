const { badRequest } = require("@reloop/shared");
const prisma = require("../../models/prismaClient");

function parseDate(value, label) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw badRequest(`${label} is invalid`);
  return date;
}

function targetType(action) {
  if (action.startsWith("REPORT_")) return "REPORT";
  if (action.startsWith("KYC_")) return "KYC_APPLICATION";
  if (["REMOVE_PRODUCT", "RESTORE_PRODUCT"].includes(action)) {
    return "PRODUCT";
  }
  if (action.startsWith("PRODUCT_")) return "PRODUCT";
  if (action.startsWith("USER_")) return "USER";
  return "UNKNOWN";
}

function normalize(item) {
  const type = targetType(item.action);
  return {
    source: "AUTH",
    eventId: item.id,
    id: item.id,
    actorId: item.actorId,
    action: item.action,
    targetType: type,
    targetId: item.targetId,
    caseId: type === "REPORT" ? item.targetId : null,
    reason: item.reason,
    occurredAt: item.createdAt,
    createdAt: item.createdAt,
    requestId: item.requestId || null,
    operationId: null,
  };
}

async function queryAudit({
  page,
  limit,
  actorId,
  action,
  actionPrefix,
  targetId,
  requestId,
  from,
  to,
}) {
  const fromDate = parseDate(from, "from");
  const toDate = parseDate(to, "to");
  if (fromDate && toDate && fromDate > toDate) {
    throw badRequest("from must be before or equal to to");
  }
  const where = {
    ...(actorId ? { actorId } : {}),
    ...(action
      ? { action }
      : actionPrefix
        ? { action: { startsWith: actionPrefix } }
        : {}),
    ...(targetId ? { targetId } : {}),
    ...(requestId ? { requestId } : {}),
    ...(fromDate || toDate
      ? {
          createdAt: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.adminAudit.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.adminAudit.count({ where }),
  ]);
  return { items: items.map(normalize), total };
}

module.exports = { queryAudit, normalize };
