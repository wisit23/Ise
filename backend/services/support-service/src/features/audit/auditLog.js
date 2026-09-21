const prisma = require("../../models/prismaClient");

/** NFR-SP-03: every privileged ticket action is attributable and timestamped. */
function record({
  ticketId,
  actorId,
  action,
  fromValue,
  toValue,
  reason,
  dedupeKey,
}) {
  return prisma.ticketAuditLog.create({
    data: {
      ticketId,
      actorId,
      action,
      fromValue: fromValue ?? null,
      toValue: toValue ?? null,
      reason: reason ?? null,
      dedupeKey: dedupeKey ?? null,
    },
  });
}

module.exports = { record };
