const db = require("../../models/prismaClient");
const { Prisma } = require("../../generated/prisma-client");
module.exports = require("@reloop/shared/src/csat").createCsat({
  db,
  Prisma,
  async readCase(tx, id) {
    const [row] = await tx.$queryRaw(Prisma.sql`
      SELECT t.requester_id, t.deleted_at, s.code,
        COALESCE(t.chat_responder_id, (SELECT a.assignee_id FROM ticket_assignments a WHERE a.ticket_id = t.ticket_id
          AND a.assigned_at <= COALESCE(
            (SELECT max(h.created_at) FROM ticket_status_history h
              JOIN ticket_statuses hs ON hs.ticket_status_id = h.to_status_id
              WHERE h.ticket_id = t.ticket_id AND hs.code IN ('RESOLVED', 'CLOSED')), now())
          ORDER BY a.assigned_at DESC, a.assignment_id DESC LIMIT 1)) AS agent_id
      FROM support_tickets t JOIN ticket_statuses s ON s.ticket_status_id = t.current_status_id
      WHERE t.ticket_id = ${id} FOR UPDATE OF t`);
    return (
      row && {
        participants: { [row.requester_id]: "REQUESTER" },
        deleted: Boolean(row.deleted_at),
        complete: ["RESOLVED", "CLOSED"].includes(row.code),
        agentId: row.agent_id,
      }
    );
  },
});
