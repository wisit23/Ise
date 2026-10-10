const { Prisma } = require("../../generated/prisma-client");
const { badRequest } = require("@reloop/shared");
const prisma = require("../../models/prismaClient");

function parseDate(value, label) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw badRequest(`${label} is invalid`);
  return date;
}

function dateWhere(from, to) {
  const fromDate = parseDate(from, "from");
  const toDate = parseDate(to, "to");
  if (fromDate && toDate && fromDate > toDate) {
    throw badRequest("from must be before or equal to to");
  }
  return fromDate || toDate
    ? {
        createdAt: {
          ...(fromDate ? { gte: fromDate } : {}),
          ...(toDate ? { lte: toDate } : {}),
        },
      }
    : {};
}

async function queryHoldAudit({
  page,
  limit,
  actorId,
  action,
  targetId,
  from,
  to,
}) {
  const where = {
    ...(actorId ? { actorId } : {}),
    ...(action ? { action: ({HOLD:"HOLD_PLACED",RELEASE:"HOLD_RELEASED",EVIDENCE_VIEWED:"ADMIN_EVIDENCE_VIEWED"})[action] || action } : {action:{in:["HOLD_PLACED","HOLD_RELEASED","ADMIN_EVIDENCE_VIEWED"]}}),
    ...(targetId ? { orderId: targetId } : {}),
    ...dateWhere(from, to),
  };
  const [rows, total] = await Promise.all([
    prisma.orderLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.orderLog.count({ where }),
  ]);
  const orderIds = [...new Set(rows.map((row) => row.orderId))];
  const cases = orderIds.length
    ? await prisma.disputeCase.findMany({
        where: { orderId: { in: orderIds } },
        select: { id: true, orderId: true },
      })
    : [];
  const caseByOrder = new Map(cases.map((item) => [item.orderId, item.id]));
  return {
    total,
    items: rows.map((row) => ({
      source: "ORDER_HOLD",
      eventId: row.id,
      id: row.id,
      actorId: row.actorId,
      action: ({HOLD_PLACED:"HOLD",HOLD_RELEASED:"RELEASE",ADMIN_EVIDENCE_VIEWED:"EVIDENCE_VIEWED"})[row.action] || row.action,
      targetType: "ORDER",
      targetId: row.orderId,
      caseId: caseByOrder.get(row.orderId) || null,
      reason: row.detail,
      occurredAt: row.createdAt,
      createdAt: row.createdAt,
      requestId: null,
      operationId: null,
    })),
  };
}

async function queryDisputeAudit({page,limit,actorId,action,targetId,caseId,from,to}) {
  const dates=dateWhere(from,to).createdAt || {};
  const clauses=[Prisma.sql`true`];
  if(actorId)clauses.push(Prisma.sql`actor_id=${actorId}`);
  if(action)clauses.push(Prisma.sql`action=${action}`);
  if(targetId)clauses.push(Prisma.sql`order_id=${targetId}`);
  if(caseId)clauses.push(Prisma.sql`case_id=${caseId}`);
  if(dates.gte)clauses.push(Prisma.sql`created_at >= ${dates.gte}`);
  if(dates.lte)clauses.push(Prisma.sql`created_at <= ${dates.lte}`);
  const base=Prisma.sql`SELECT l.id,l.dispute_case_id AS case_id,l.actor_id,l.action,l.detail,l.created_at,d.order_id
    FROM dispute_case_log l JOIN dispute_case d ON d.id=l.dispute_case_id
    UNION ALL SELECT l.dispute_audit_log_id AS id,e.dispute_case_id AS case_id,l.actor_id,l.action,l.detail,l.created_at,d.order_id
    FROM dispute_audit_log l JOIN dispute_evidence e ON e.dispute_evidence_id=l.dispute_evidence_id JOIN dispute_case d ON d.id=e.dispute_case_id`;
  const filter=Prisma.join(clauses,' AND ');
  const [rows,counts]=await Promise.all([
    prisma.$queryRaw`SELECT * FROM (${base}) events WHERE ${filter} ORDER BY created_at DESC,id DESC LIMIT ${limit} OFFSET ${(page-1)*limit}`,
    prisma.$queryRaw`SELECT count(*)::int AS total FROM (${base}) events WHERE ${filter}`
  ]);
  return {total:counts[0].total,items:rows.map(row=>({source:"ORDER_DISPUTE",eventId:row.id,id:row.id,actorId:row.actor_id,action:row.action,targetType:"ORDER",targetId:row.order_id,caseId:row.case_id,reason:row.detail,occurredAt:row.created_at,createdAt:row.created_at,requestId:null,operationId:null}))};
}

async function queryAudit({ kind, ...filters }) {
  if (kind === "holds") return queryHoldAudit(filters);
  if (kind === "disputes") return queryDisputeAudit(filters);
  throw badRequest("kind must be one of holds or disputes");
}

module.exports = { queryAudit, queryHoldAudit, queryDisputeAudit };
