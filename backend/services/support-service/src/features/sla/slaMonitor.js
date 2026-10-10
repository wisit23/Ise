const { customerServiceRuntime } = require("@reloop/shared");
const prisma = require("../../models/prismaClient");
const ticketModel = require("../tickets/ticketModel");

async function checkAndEscalate(now = new Date()) {
  const overdue = await prisma.ticketSlaTarget.findMany({
    where: {
      achievedAt: null,
      breachedAt: null,
      dueAt: { lte: now },
      ticket: { currentStatus: { code: { notIn: ["CLOSED", "RESOLVED"] } } },
    },
    select: { ticketId: true },
    distinct: ["ticketId"],
  });
  let escalated = 0;
  for (const { ticketId } of overdue) {
    if (await ticketModel.escalateOverdue(ticketId, now)) escalated++;
  }
  return { checked: overdue.length, escalated };
}
let timer;
function start(intervalMs = customerServiceRuntime.slaMonitorIntervalMs) {
  if (timer) return;
  timer = setInterval(
    () =>
      checkAndEscalate().catch((error) =>
        console.error("[sla-monitor]", error.message),
      ),
    intervalMs,
  );
  timer.unref();
}
function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}
async function runOnce(now = new Date()) {
  return (await checkAndEscalate(now)).escalated;
}
module.exports = { checkAndEscalate, runOnce, start, stop };
