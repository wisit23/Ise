const { customerServicePolicy: config } = require("./customerServiceConfig");
const POLICY_VERSION = config.version;
const SERVICE_POLICIES = config.priorities;
const classificationRules = config.classification.rules.map((rule) => ({
  ...rule,
  matches: rule.pattern ? new RegExp(rule.pattern, "u") : null,
  excludes: rule.excludePattern ? new RegExp(rule.excludePattern, "u") : null,
}));
function getServicePolicy(priority) {
  const policy =
    SERVICE_POLICIES[priority === "CRITICAL" ? "URGENT" : priority];
  if (!policy) throw new RangeError("Unknown case priority");
  return { ...policy, version: POLICY_VERSION, clock: config.clock };
}
function classifyCase({
  category = "GENERAL",
  isDispute = false,
  amount = 0,
  reason = "",
} = {}) {
  // NFC preserves Thai sara am; NFKC decomposes it and breaks symptom matching.
  const text = String(reason).normalize("NFC").toLowerCase();
  const money = Math.max(0, Number(amount) || 0);
  const rules = [];
  let priority = config.classification.defaultPriority;
  for (const rule of classificationRules) {
    if (rule.category && rule.category !== category) continue;
    if (rule.isDispute !== undefined && rule.isDispute !== isDispute) continue;
    if (rule.financialOnly && !isDispute && category !== "PAYMENT") continue;
    if (rule.minimumAmount !== undefined && money < rule.minimumAmount)
      continue;
    if (rule.amountGreaterThan !== undefined && money <= rule.amountGreaterThan)
      continue;
    if (rule.matches && !rule.matches.test(text)) continue;
    if (rule.excludes && rule.excludes.test(text)) continue;
    if (
      rule.mode === "set" ||
      SERVICE_POLICIES[rule.priority].rank > SERVICE_POLICIES[priority].rank
    )
      priority = rule.priority;
    rules.push(rule.code);
  }
  if (!rules.length) rules.push(config.classification.fallbackReason);
  return { priority, reasonCodes: rules, policyVersion: POLICY_VERSION };
}
function addMinutes(from, minutes) {
  const date = new Date(from);
  if (!Number.isFinite(+date)) throw new RangeError("Invalid SLA start");
  return new Date(+date + minutes * 60000);
}
function disputeDeadlines(priority, from = new Date()) {
  const policy = getServicePolicy(priority);
  const firstReviewDueAt = addMinutes(from, policy.disputeReviewMinutes);
  return {
    firstReviewDueAt,
    decisionDueAt: addMinutes(from, policy.disputeDecisionMinutes),
    slaExpiresAt: firstReviewDueAt,
    slaPolicyVersion: policy.version,
  };
}
function disputeSla(dispute) {
  if (dispute.status === "DECIDED")
    return { state: "complete", dueAt: null, metric: null };
  const review = !dispute.firstReviewedAt && dispute.firstReviewDueAt;
  const dueAt = review
    ? dispute.firstReviewDueAt
    : dispute.decisionDueAt || dispute.slaExpiresAt || null;
  return {
    state: dueAt ? "active" : "none",
    dueAt,
    metric: review
      ? "FIRST_REVIEW"
      : dispute.slaPolicyVersion
        ? "DECISION"
        : null,
  };
}
module.exports = {
  POLICY_VERSION,
  SERVICE_POLICIES,
  getServicePolicy,
  classifyCase,
  addMinutes,
  disputeDeadlines,
  disputeSla,
};
