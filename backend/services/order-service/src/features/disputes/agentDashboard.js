const prisma = require("../../models/prismaClient");
const { Prisma } = require("../../generated/prisma-client");
const {
  dashboardOptions,
  readAgentDashboard,
} = require("@reloop/shared/src/agentDashboard");

function disputeDashboardBase(userId) {
  return Prisma.sql`
    SELECT id, order_id AS reference, reason AS subject, status, priority, priority_score,
      created_at AT TIME ZONE 'UTC' AS created_at, assigned_to AS assignee_id,
      sla_expires_at AT TIME ZONE 'UTC' AS due_at
    FROM dispute_cases
    WHERE status IN ('OPEN', 'NEEDS_INFO')
      AND (assigned_role IS NULL OR assigned_role = 'CUSTOMER_SERVICE')
      AND (assigned_to IS NULL OR assigned_to = ${userId})
  `;
}

function disputeActivityBase(userId) {
  return Prisma.sql`
    SELECT dispute_id AS id, CASE action WHEN 'CLAIM' THEN 'RECEIVED' ELSE 'COMPLETED' END AS kind,
      created_at AT TIME ZONE 'UTC' AS happened_at
    FROM dispute_audit_logs WHERE actor_id = ${userId} AND action IN ('CLAIM', 'ESCALATE')
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
          disputeDashboardBase(options.userId),
          options.userId,
          "disputes",
        );
    } catch {
      options.replyIds = null;
    }
    const data = await readAgentDashboard(
      prisma,
      Prisma,
      disputeDashboardBase(options.userId),
      options,
      new Date(),
      disputeActivityBase(options.userId),
    );
    res.set("Cache-Control", "private, no-store");
    res.json(data);
  } catch (error) {
    next(error);
  }
}

module.exports = { agentDashboard, disputeDashboardBase, disputeActivityBase };
