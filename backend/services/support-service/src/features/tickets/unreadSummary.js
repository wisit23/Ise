const { forbidden, effectiveStaffRole } = require("@reloop/shared");
const prisma = require("../../models/prismaClient");
const { Prisma } = require("../../generated/prisma-client");
const { queueFilter } = require("./ticketModel");
const { readCaseUnread } = require("@reloop/shared/src/caseUnread");

/** Unread customer messages across the open tickets this staff member may see. */
async function readUnreadSummary({ role, userId }) {
  if (!["CUSTOMER_SERVICE", "TRUST_AND_SAFETY", "ADMIN"].includes(role))
    throw forbidden("Only support staff can read unread summaries");
  const filter = queueFilter({ role, scope: "all", assigneeId: userId });
  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT t.ticket_id AS id, a.assignee_id AS "assigneeId", t.chat_responder_id AS "chatResponderId"
    FROM support_tickets t JOIN ticket_statuses s ON s.ticket_status_id=t.current_status_id
    JOIN ticket_priorities p ON p.ticket_priority_id=t.ticket_priority_id
    LEFT JOIN ticket_assignments a ON a.ticket_id=t.ticket_id AND a.ended_at IS NULL
    ${filter} AND s.code NOT IN ('CLOSED','RESOLVED')
  `);
  return readCaseUnread(rows, userId, "tickets");
}

// HTTP layer for GET /tickets/unread-summary.
async function unreadSummary(req, res, next) {
  try {
    const data = await readUnreadSummary({ role: effectiveStaffRole(req), userId: req.userId });
    res.set("Cache-Control", "private, no-store");
    res.json(data);
  } catch (err) {
    next(err);
  }
}
module.exports = { unreadSummary, readUnreadSummary };
