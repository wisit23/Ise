const { badRequest } = require("@reloop/shared");
const prisma = require("../../models/prismaClient");

function parseDate(value, label) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw badRequest(`${label} is invalid`);
  return date;
}

async function queryAudit({
  page,
  limit,
  actorId,
  action,
  targetId,
  operationId,
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
    ...(action ? { action } : {}),
    ...(targetId ? { ticketId: targetId } : {}),
    ...(operationId ? { dedupeKey: operationId } : {}),
    ...(fromDate || toDate
      ? {
          createdAt: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.ticketAuditLog.findMany({
      where,
      include: { ticket: { select: { ticketNumber: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.ticketAuditLog.count({ where }),
  ]);
  return {
    total,
    items: rows.map((row) => ({
      source: "SUPPORT",
      eventId: row.id,
      id: row.id,
      actorId: row.actorId,
      action: row.action,
      targetType: "TICKET",
      targetId: row.ticketId,
      caseId: row.ticketId,
      caseNumber: row.ticket.ticketNumber,
      reason: row.reason,
      fromValue: row.fromValue,
      toValue: row.toValue,
      occurredAt: row.createdAt,
      createdAt: row.createdAt,
      requestId: null,
      operationId: row.dedupeKey || null,
    })),
  };
}

module.exports = { queryAudit };
