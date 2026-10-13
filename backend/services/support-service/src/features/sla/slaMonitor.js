const { customerServiceRuntime } = require("@reloop/shared");
const prisma = require("../../models/prismaClient");
const ticketModel = require("../tickets/ticketModel");
const { activeTarget } = require("../tickets/ticketEvents");

async function checkAndEscalate(now = new Date()) {
  const overdue = await prisma.$queryRaw`
    SELECT DISTINCT st.ticket_id AS "ticketId" FROM ticket_sla_targets st
    JOIN support_tickets t ON t.ticket_id=st.ticket_id
    JOIN ticket_statuses s ON s.ticket_status_id=t.current_status_id
    WHERE st.achieved_at IS NULL AND st.breached_at IS NULL AND st.due_at <= ${now}
      AND s.code NOT IN ('CLOSED','RESOLVED') AND ${activeTarget}`;
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
