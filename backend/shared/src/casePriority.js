const {
  customerServicePolicy: { scoring },
} = require("./customerServiceConfig");
const { classifyCase, getServicePolicy } = require("./servicePolicy");
function scoreCase({
  amount = 0,
  reportCount = 0,
  reason = "",
  category,
  priority,
  isDispute = false,
  slaExpiresAt,
  now = new Date(),
} = {}) {
  const assessment = classifyCase({
    amount,
    reason,
    category: category || "GENERAL",
    isDispute,
  });
  const level = priority || assessment.priority;
  const rank = getServicePolicy(level).rank;
  const money = Math.min(
    scoring.maximumAmountScore,
    Math.floor(Math.max(0, Number(amount) || 0) / scoring.amountDivisor),
  );
  // Unverified report history is a bounded tie-breaker, never proof of severity.
  const risk = Math.min(
    scoring.maximumReportScore,
    Math.max(0, Number(reportCount) || 0) * scoring.reportWeight,
  );
  let urgency = 0;
  if (slaExpiresAt) {
    const remaining = +new Date(slaExpiresAt) - +new Date(now);
    if (Number.isFinite(remaining)) {
      if (remaining <= 0) urgency = scoring.overdueScore;
      else
        urgency =
          scoring.urgency.find(
            (entry) => remaining <= entry.remainingMinutes * 60000,
          )?.score || 0;
    }
  }
  return {
    ...assessment,
    priority: level,
    priorityScore: rank * scoring.rankWeight + money + risk + urgency,
  };
}
module.exports = { scoreCase };
