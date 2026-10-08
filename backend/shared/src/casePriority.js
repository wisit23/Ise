// Score is deterministic for a given snapshot. Queue readers pass `now` so
// the SLA term increases without waiting for a background worker.
function scoreCase({ amount = 0, reportCount = 0, reason = "", slaExpiresAt, isDispute = false, now = new Date() }) {
  const normalizedReason = String(reason).toLowerCase();
  const severe = /fraud|scam|counterfeit|fake|โกง|หลอก|ปลอม/.test(normalizedReason);
  const base = isDispute ? 30 : 10;
  const amountScore = Math.min(25, Math.floor(Math.max(0, Number(amount) || 0) / 1000));
  const riskScore = Math.min(20, Math.max(0, Number(reportCount) || 0) * 5);
  let slaScore = 0;
  if (slaExpiresAt) {
    const remaining = new Date(slaExpiresAt).getTime() - new Date(now).getTime();
    if (remaining <= 0) slaScore = 30;
    else if (remaining <= 60 * 60 * 1000) slaScore = 25;
    else if (remaining <= 4 * 60 * 60 * 1000) slaScore = 15;
  }
  const score = Math.min(100, base + (severe ? 65 : 0) + amountScore + riskScore + slaScore);
  const priority = score >= 75 ? "CRITICAL" : score >= 50 ? "HIGH" : score >= 25 ? "NORMAL" : "LOW";
  return { priorityScore: score, priority };
}

module.exports = { scoreCase };
