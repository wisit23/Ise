const { Prisma } = require("../../generated/prisma-client");
const audit = require("../audit/auditLog");
const { AppError } = require("@reloop/shared");

const ROUND_EVENTS = ["TICKET_OPENED", "TICKET_REOPENED"];
const STATE_EVENTS = [...ROUND_EVENTS, "QUEUE_CLASSIFIED", "CHAT_RESPONDER_CHANGED"];

function rounds(events = []) {
  return events.filter((e) => ROUND_EVENTS.includes(e.action))
    .map((e) => ({ ...e.payload, eventId: e.id }))
    .sort((a, b) => b.cycle - a.cycle);
}
function state(events = []) {
  const latest = (action) => events.filter((e) => e.action === action).sort((a, b) =>
    (b.payload.ticketVersion ?? 0) - (a.payload.ticketVersion ?? 0) ||
    +new Date(b.createdAt) - +new Date(a.createdAt) || b.id.localeCompare(a.id))[0]?.payload;
  const queue = latest("QUEUE_CLASSIFIED");
  return {
    priorityScore: queue?.priorityScore ?? 0,
    riskReportCount: queue?.riskReportCount ?? 0,
    chatResponderId: latest("CHAT_RESPONDER_CHANGED")?.responderId ?? null,
  };
}
function effectiveTargets(targets = [], events = []) {
  const history = rounds(events);
  const owners = new Set();
  for (const round of history) {
    const metrics = new Set();
    for (const ref of round.targets || []) {
      const target = targets.find(t => t.id === ref.id);
      if (!target || owners.has(ref.id) || metrics.has(ref.metricType) ||
        target.metricType !== ref.metricType || (ref.policyId && target.policyId !== ref.policyId))
        throw new AppError(503, "Ticket SLA history is inconsistent; repair explicit round references");
      owners.add(ref.id); metrics.add(ref.metricType);
    }
  }
  if (targets.some(t => !owners.has(t.id)))
    throw new AppError(503, "Ticket SLA history is incomplete; explicit round references are required");
  const selected = new Map();
  for (const round of history) {
    for (const ref of round.targets || []) {
      if (selected.has(ref.metricType)) continue;
      const target = targets.find((t) => t.id === ref.id);
      if (target) selected.set(ref.metricType, { ...target, cycle: round.cycle, round });
    }
  }
  return [...selected.values()];
}
function policySnapshot(policy) {
  return {
    id: policy.id, effectiveFrom: new Date(policy.effectiveFrom).toISOString(),
    effectiveTo: policy.effectiveTo ? new Date(policy.effectiveTo).toISOString() : null,
    firstResponseMinutes: policy.firstResponseMinutes,
    resolutionMinutes: policy.resolutionMinutes,
  };
}
async function recordRound(db, { ticketId, actorId, at, cycle, targets, policy, sourceHistoryId }) {
  if (!targets.length || targets.some(t => t.ticketId !== ticketId || t.policyId !== policy.id) ||
    new Set(targets.map(t => t.metricType)).size !== targets.length)
    throw new AppError(503, "Invalid SLA round target ownership");
  return audit.record({ ticketId, actorId,
    action: cycle === 1 ? "TICKET_OPENED" : "TICKET_REOPENED",
    dedupeKey: `sla-round:${ticketId}:${cycle}`, createdAt: at,
    payload: { schemaVersion: 1, cycle, startedAt: at.toISOString(), sourceHistoryId,
      targets: targets.map((t) => ({ id: t.id, metricType: t.metricType,
        policyId: t.policyId, policy: policySnapshot(policy) })) },
  }, db);
}
async function recordResponder(db, { ticketId, actorId, responderId, at, ticketVersion }) {
  return audit.record({ ticketId, actorId, action: "CHAT_RESPONDER_CHANGED", createdAt: at,
    payload: { schemaVersion: 1, responderId, ticketVersion, reason: "Explicit chat responsibility" } }, db);
}
// Same event ordering for API projections and SQL queue/dashboard consumers.
const stateJoins = Prisma.sql`
  LEFT JOIN LATERAL (SELECT payload FROM ticket_audit_events
    WHERE ticket_id=t.ticket_id AND event_type='QUEUE_CLASSIFIED'
    ORDER BY COALESCE((payload->>'ticketVersion')::int,0) DESC, created_at DESC, audit_event_id DESC LIMIT 1) q ON true
  LEFT JOIN LATERAL (SELECT payload->>'responderId' AS responder_id FROM ticket_audit_events
    WHERE ticket_id=t.ticket_id AND event_type='CHAT_RESPONDER_CHANGED'
    ORDER BY COALESCE((payload->>'ticketVersion')::int,0) DESC, created_at DESC, audit_event_id DESC LIMIT 1) cr ON true`;
// Select the explicitly recorded current target per metric, not the closest timestamp.
const activeTarget = Prisma.sql`st.sla_target_id = (
  SELECT ref->>'id' FROM ticket_audit_events e,
    LATERAL jsonb_array_elements(e.payload->'targets') ref
  WHERE e.ticket_id=st.ticket_id AND e.event_type IN ('TICKET_OPENED','TICKET_REOPENED')
    AND ref->>'metricType'=st.metric_type
  ORDER BY (e.payload->>'cycle')::int DESC LIMIT 1)`;
module.exports = { ROUND_EVENTS, STATE_EVENTS, rounds, state, effectiveTargets, policySnapshot, recordRound, recordResponder, stateJoins, activeTarget };
