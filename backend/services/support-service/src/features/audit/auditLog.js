const prisma = require("../../models/prismaClient");

async function record(
  {
    ticketId,
    actorId,
    action,
    fromValue,
    toValue,
    reason,
    dedupeKey,
    payload,
    createdAt,
  },
  db = prisma,
) {
  try {
    return await db.ticketAuditLog.create({
      data: {
        ticketId,
        actorId,
        action,
        dedupeKey: dedupeKey ?? null,
        payload: payload ?? {
          ...(fromValue !== undefined ? { fromValue } : {}),
          ...(toValue !== undefined ? { toValue } : {}),
          ...(reason !== undefined ? { reason } : {}),
        },
        ...(createdAt ? { createdAt } : {}),
      },
    });
  } catch (error) {
    // Standalone join retries are safe to re-read after an autocommit conflict.
    // Transactional message retries are handled by their enclosing transaction.
    if (db !== prisma || !dedupeKey || error.code !== "P2002") throw error;
    const existing = await db.ticketAuditLog.findUnique({
      where: { dedupeKey },
    });
    if (!existing) throw error;
    return existing;
  }
}
module.exports = { record };
