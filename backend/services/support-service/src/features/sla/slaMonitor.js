const { customerServiceRuntime } = require("@reloop/shared");
const prisma = require("../../models/prismaClient");
const ticketModel = require("../tickets/ticketModel");
const { activeTarget } = require("../tickets/ticketEvents");

async function checkOverdue(now = new Date()) {
  const overdue = await prisma.$queryRaw`
    SELECT DISTINCT st.ticket_id AS "ticketId" FROM ticket_sla_targets st
    JOIN support_tickets t ON t.ticket_id=st.ticket_id
    JOIN ticket_statuses s ON s.ticket_status_id=t.current_status_id
    WHERE st.achieved_at IS NULL AND st.breached_at IS NULL AND st.due_at <= ${now}
      AND s.code NOT IN ('CLOSED','RESOLVED') AND ${activeTarget}`;
  let breached = 0;
  for (const { ticketId } of overdue) {
    if (await ticketModel.markOverdue(ticketId, now)) breached++;
  }
  return { checked: overdue.length, breached };
}
let timer;
function start(intervalMs = customerServiceRuntime.slaMonitorIntervalMs) {
  if (!timer)
    timer = require("@reloop/shared").startPeriodicTask(
      checkOverdue,
      intervalMs,
    );
  return timer;
}
async function stop() {
  const current = timer;
  timer = null;
  await current?.stop();
}
async function runOnce(now = new Date()) {
  return (await checkOverdue(now)).breached;
}
module.exports = { checkOverdue, runOnce, start, stop };
