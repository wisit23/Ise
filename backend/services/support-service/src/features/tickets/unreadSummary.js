const { forbidden, effectiveStaffRole } = require("@reloop/shared");
const prisma = require("../../models/prismaClient");
const { Prisma } = require("../../generated/prisma-client");
const { queueFilter } = require("./ticketModel");
const { readCaseUnread } = require("@reloop/shared/src/caseUnread");

async function unreadSummary(req, res, next) {
  try {
    const role = effectiveStaffRole(req);
    if (!["CUSTOMER_SERVICE", "TRUST_AND_SAFETY", "ADMIN"].includes(role))
      throw forbidden("Only support staff can read unread summaries");
    const filter = queueFilter({ role, scope: "all", assigneeId: req.userId });
    const rows = await prisma.$queryRaw(Prisma.sql`
      SELECT t.ticket_id AS id, a.assignee_id AS "assigneeId", t.chat_responder_id AS "chatResponderId"
      FROM support_tickets t JOIN ticket_statuses s ON s.ticket_status_id=t.current_status_id
      JOIN ticket_priorities p ON p.ticket_priority_id=t.ticket_priority_id
      LEFT JOIN ticket_assignments a ON a.ticket_id=t.ticket_id AND a.ended_at IS NULL
      ${filter} AND s.code NOT IN ('CLOSED','RESOLVED')
    `);
    res.set("Cache-Control", "private, no-store");
    res.json(await readCaseUnread(rows, req.userId, "tickets"));
  } catch (err) {
    next(err);
  }
}
module.exports = { unreadSummary };
