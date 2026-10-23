const { Prisma } = require("../../generated/prisma-client");
const audit = require("../audit/auditLog");
const { AppError } = require("@reloop/shared");

const ROUND_EVENTS = ["TICKET_OPENED", "TICKET_REOPENED"];
const STATE_EVENTS = [
  ...ROUND_EVENTS,
  "QUEUE_CLASSIFIED",
  "CHAT_RESPONDER_CHANGED",
];

function rounds(targets = []) {
  const found = new Map();
  for (const target of targets) {
    if (!target.round) throw new AppError(503, "Ticket SLA round is missing");
    found.set(target.round.id, target.round);
  }
  return [...found.values()].sort((a, b) => b.cycle - a.cycle);
}
function effectiveTargets(targets = []) {
  const selected = new Map();
  for (const target of [...targets].sort(
    (a, b) => (b.round?.cycle ?? 0) - (a.round?.cycle ?? 0),
  )) {
    const round = target.round;
    if (
      !round ||
      (round.ticketId && target.ticketId !== round.ticketId) ||
      (round.policyId && target.policyId !== round.policyId)
    )
      throw new AppError(503, "Ticket SLA round ownership is inconsistent");
    if (!selected.has(target.metricType))
      selected.set(target.metricType, { ...target, cycle: round.cycle });
  }
  return [...selected.values()];
}
function policyFromRound(round) {
  return {
    id: round.policyId,
    effectiveFrom: round.policyEffectiveFrom,
    effectiveTo: round.policyEffectiveTo,
    firstResponseMinutes: round.firstResponseMinutes,
    resolutionMinutes: round.resolutionMinutes,
    snapshotSource: round.snapshotSource,
  };
}
function policySnapshot(policy) {
  return {
    id: policy.id,
    effectiveFrom: policy.effectiveFrom
      ? new Date(policy.effectiveFrom).toISOString()
      : null,
    effectiveTo: policy.effectiveTo
      ? new Date(policy.effectiveTo).toISOString()
      : null,
    firstResponseMinutes: policy.firstResponseMinutes,
    resolutionMinutes: policy.resolutionMinutes,
  };
}
async function recordRound(
  db,
  { ticketId, actorId, at, cycle, targets, policy, sourceHistoryId },
) {
  if (
    !targets.length ||
    targets.some((t) => t.ticketId !== ticketId || t.policyId !== policy.id) ||
    new Set(targets.map((t) => t.metricType)).size !== targets.length
  )
    throw new AppError(503, "Invalid SLA round target ownership");
  const roundId = targets[0].roundId;
  if (!roundId || targets.some((t) => t.roundId !== roundId))
    throw new AppError(503, "Missing explicit round ID");
  const round = await db.ticketSlaRound.create({
    data: {
      id: roundId,
      ticketId,
      cycle,
      startedAt: at,
      sourceHistoryId: sourceHistoryId ?? null,
      policyId: policy.id,
      policyEffectiveFrom: policy.effectiveFrom ?? null,
      policyEffectiveTo: policy.effectiveTo ?? null,
      firstResponseMinutes: policy.firstResponseMinutes ?? null,
      resolutionMinutes: policy.resolutionMinutes ?? null,
      snapshotSource: policy.snapshotSource || "creation-time",
    },
  });
  await audit.record(
    {
      ticketId,
      actorId,
      action: cycle === 1 ? "TICKET_OPENED" : "TICKET_REOPENED",
      dedupeKey: `sla-round:${ticketId}:${cycle}`,
      createdAt: at,
      payload: {
        schemaVersion: 1,
        cycle,
        startedAt: at.toISOString(),
        sourceHistoryId,
        targets: targets.map((t) => ({
          id: t.id,
          metricType: t.metricType,
          policyId: t.policyId,
          policy: policySnapshot(policy),
        })),
      },
    },
    db,
  );
  return round;
}
async function recordResponder(
  db,
  { ticketId, actorId, responderId, at, ticketVersion },
) {
  await db.supportTicket.update({
    where: { id: ticketId },
    data: { chatResponderId: responderId },
  });
  return audit.record(
    {
      ticketId,
      actorId,
      action: "CHAT_RESPONDER_CHANGED",
      createdAt: at,
      payload: {
        schemaVersion: 1,
        responderId,
        ticketVersion,
        reason: "Explicit chat responsibility",
      },
    },
    db,
  );
}
// SLA targets are linked to typed rounds; no audit JSON is needed at runtime.
const activeTarget = Prisma.sql`st.sla_round_id = (
 SELECT r.sla_round_id FROM ticket_sla_rounds r JOIN ticket_sla_targets target ON target.sla_round_id=r.sla_round_id
 WHERE r.ticket_id=st.ticket_id AND target.metric_type=st.metric_type ORDER BY r.cycle DESC LIMIT 1)`;
module.exports = {
  ROUND_EVENTS,
  STATE_EVENTS,
  rounds,
  effectiveTargets,
  policySnapshot,
  policyFromRound,
  recordRound,
  recordResponder,
  activeTarget,
};
