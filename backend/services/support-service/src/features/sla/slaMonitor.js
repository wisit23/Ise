const prisma = require("../../models/prismaClient");
const auditLog = require("../audit/auditLog");

/**
 * WF-10's SLA monitor: escalates any ticket past its slaDueAt that isn't
 * already resolved/closed/escalated.
 *
 * `escalatedAt: null` in the where clause is what makes this safe to run
 * from multiple instances at once — Postgres's row-level locking means only
 * one UPDATE can win the race for a given row, so `updateMany` here is an
 * atomic "claim exactly once" rather than a read-then-write that two
 * instances could both pass.
 */
async function runOnce(now = new Date()) {
  const overdue = await prisma.supportTicket.findMany({
    where: {
      status: { notIn: ["RESOLVED", "CLOSED", "ESCALATED"] },
      slaDueAt: { lt: now },
    },
    select: { id: true, status: true },
  });

  let escalatedCount = 0;
  for (const ticket of overdue) {
    const { count } = await prisma.supportTicket.updateMany({
      where: { id: ticket.id, escalatedAt: null },
      data: { status: "ESCALATED", escalatedAt: now },
    });
    if (count > 0) {
      escalatedCount += 1;
      await auditLog.record({
        ticketId: ticket.id,
        actorId: "system:sla-monitor",
        action: "ESCALATE",
        fromValue: ticket.status,
        toValue: "ESCALATED",
        reason: "SLA due date passed",
      });
    }
  }
  return escalatedCount;
}

/** Starts the monitor on an interval; returns a stop function for tests/shutdown. */
function start({ intervalMs = 60_000 } = {}) {
  const timer = setInterval(() => {
    runOnce().catch((err) => console.error("[sla-monitor] run failed:", err));
  }, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}

module.exports = { runOnce, start };
