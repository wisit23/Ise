const { badRequest } = require("@reloop/shared");
const prisma = require("../../models/prismaClient");

function parseDate(value, label) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw badRequest(`${label} is invalid`);
  return date;
}

function dateWhere(from, to) {
  const fromDate = parseDate(from, "from");
  const toDate = parseDate(to, "to");
  if (fromDate && toDate && fromDate > toDate) {
    throw badRequest("from must be before or equal to to");
  }
  return fromDate || toDate
    ? {
        createdAt: {
          ...(fromDate ? { gte: fromDate } : {}),
          ...(toDate ? { lte: toDate } : {}),
        },
      }
    : {};
}

async function queryHoldAudit({
  page,
  limit,
  actorId,
  action,
  targetId,
  from,
  to,
}) {
  const where = {
    ...(actorId ? { actorId } : {}),
    ...(action ? { action } : {}),
    ...(targetId ? { orderId: targetId } : {}),
    ...dateWhere(from, to),
  };
  const [rows, total] = await Promise.all([
    prisma.disputeAudit.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.disputeAudit.count({ where }),
  ]);
  const orderIds = [...new Set(rows.map((row) => row.orderId))];
  const cases = orderIds.length
    ? await prisma.disputeCase.findMany({
        where: { orderId: { in: orderIds } },
        select: { id: true, orderId: true },
      })
    : [];
  const caseByOrder = new Map(cases.map((item) => [item.orderId, item.id]));
  return {
    total,
    items: rows.map((row) => ({
      source: "ORDER_HOLD",
      eventId: row.id,
      id: row.id,
      actorId: row.actorId,
      action: row.action,
      targetType: "ORDER",
      targetId: row.orderId,
      caseId: caseByOrder.get(row.orderId) || null,
      reason: row.reason,
      occurredAt: row.createdAt,
      createdAt: row.createdAt,
      requestId: null,
      operationId: null,
    })),
  };
}

async function queryDisputeAudit({
  page,
  limit,
  actorId,
  action,
  targetId,
  caseId,
  from,
  to,
}) {
  const where = {
    ...(actorId ? { actorId } : {}),
    ...(action ? { action } : {}),
    ...(caseId ? { disputeId: caseId } : {}),
    ...(targetId ? { dispute: { orderId: targetId } } : {}),
    ...dateWhere(from, to),
  };
  const [rows, total] = await Promise.all([
    prisma.disputeAuditLog.findMany({
      where,
      include: { dispute: { select: { orderId: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.disputeAuditLog.count({ where }),
  ]);
  return {
    total,
    items: rows.map((row) => ({
      source: "ORDER_DISPUTE",
      eventId: row.id,
      id: row.id,
      actorId: row.actorId,
      action: row.action,
      targetType: "ORDER",
      targetId: row.dispute.orderId,
      caseId: row.disputeId,
      reason: row.detail,
      occurredAt: row.createdAt,
      createdAt: row.createdAt,
      requestId: null,
      operationId: null,
    })),
  };
}

async function queryAudit({ kind, ...filters }) {
  if (kind === "holds") return queryHoldAudit(filters);
  if (kind === "disputes") return queryDisputeAudit(filters);
  throw badRequest("kind must be one of holds or disputes");
}

module.exports = { queryAudit, queryHoldAudit, queryDisputeAudit };
