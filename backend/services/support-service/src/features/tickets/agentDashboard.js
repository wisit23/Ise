const prisma = require("../../models/prismaClient");
const { Prisma } = require("../../generated/prisma-client");
const {
  dashboardOptions,
  readAgentDashboard,
} = require("@reloop/shared/src/agentDashboard");

function ticketDashboardBase(userId) {
  return Prisma.sql`
    SELECT t.id, t.ticket_number AS reference, t.subject, s.code AS status,
      p.code AS priority, t.priority_score, t.created_at, a.assignee_id, sla.due_at
    FROM support_tickets t
    JOIN ticket_statuses s ON s.ticket_status_id = t.current_status_id
    JOIN ticket_priorities p ON p.ticket_priority_id = t.ticket_priority_id
    LEFT JOIN ticket_assignments a ON a.ticket_id = t.id AND a.ended_at IS NULL
    LEFT JOIN LATERAL (
      SELECT min(due_at) AS due_at FROM ticket_sla_targets
      WHERE ticket_id = t.id AND achieved_at IS NULL
    ) sla ON true
    WHERE s.code IN ('NEW', 'ASSIGNED', 'IN_PROGRESS', 'PENDING_USER')
      AND (a.assignee_id IS NULL OR a.assignee_id = ${userId})
  `;
}

function ticketActivityBase(userId) {
  return Prisma.sql`
    SELECT ticket_id AS id, 'RECEIVED'::text AS kind, assigned_at AS happened_at
    FROM ticket_assignments WHERE assignee_id = ${userId}
    UNION ALL
    SELECT h.ticket_id AS id, 'COMPLETED'::text AS kind, h.created_at AS happened_at
    FROM ticket_status_history h JOIN ticket_statuses s ON s.ticket_status_id = h.to_status_id
    WHERE h.changed_by_id = ${userId} AND s.code = 'RESOLVED'
  `;
}

async function agentDashboard(req, res, next) {
  try {
    const options = dashboardOptions(req);
    try {
      options.replyIds =
        await require("@reloop/shared/src/awaitingReply").awaitingReplyIds(
          prisma,
          Prisma,
          ticketDashboardBase(options.userId),
          options.userId,
          "tickets",
        );
    } catch {
      options.replyIds = null;
    }
    const data = await readAgentDashboard(
      prisma,
      Prisma,
      ticketDashboardBase(options.userId),
      options,
      new Date(),
      ticketActivityBase(options.userId),
    );
    res.set("Cache-Control", "private, no-store");
    res.json(data);
  } catch (error) {
    next(error);
  }
}

module.exports = { agentDashboard, ticketDashboardBase, ticketActivityBase };
