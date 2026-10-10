const fs = require("node:fs");
const { isDeepStrictEqual } = require("node:util");
const defaults = require("../config/customer-service-policy.json");
const clientDefaults = require("../config/customer-service-client.json");
const {
  positiveInteger,
  validateClientConfig,
} = require("../config/validate-client");

function freeze(value) {
  for (const child of Object.values(value))
    if (child && typeof child === "object") freeze(child);
  return Object.freeze(value);
}

function validatePolicy(policy) {
  if (!policy || !/^[a-zA-Z0-9_-]+$/.test(policy.version))
    throw new RangeError("Customer service policy requires a stable version");
  if (policy.clock !== "CALENDAR_24X7")
    throw new RangeError("Only CALENDAR_24X7 is supported");
  positiveInteger(policy.evidenceResponseMinutes, "evidenceResponseMinutes");
  const ranks = new Set();
  let previousRank = 0;
  if (
    !policy.priorities ||
    Object.keys(policy.priorities).length !==
      Object.keys(defaults.priorities).length
  )
    throw new RangeError(
      "Policy must contain exactly the supported priorities",
    );
  for (const level of Object.keys(defaults.priorities)) {
    const entry = policy.priorities?.[level];
    if (!entry) throw new RangeError(`Missing priority ${level}`);
    for (const key of Object.keys(defaults.priorities[level]))
      positiveInteger(entry[key], `${level}.${key}`);
    if (ranks.has(entry.rank))
      throw new RangeError("Priority ranks must be unique");
    if (entry.rank <= previousRank)
      throw new RangeError("Priority ranks must increase from LOW to URGENT");
    ranks.add(entry.rank);
    previousRank = entry.rank;
    if (
      entry.resolutionMinutes <= entry.firstResponseMinutes ||
      entry.disputeDecisionMinutes - entry.disputeReviewMinutes <=
        policy.evidenceResponseMinutes
    )
      throw new RangeError(`Invalid response/decision windows for ${level}`);
  }
  const classification = policy.classification;
  if (
    !policy.priorities[classification?.defaultPriority] ||
    typeof classification.fallbackReason !== "string" ||
    !classification.fallbackReason ||
    !Array.isArray(classification.rules) ||
    !classification.rules.length
  )
    throw new RangeError("Invalid classification policy");
  const codes = new Set();
  const ruleFields = new Set([
    "code",
    "priority",
    "category",
    "isDispute",
    "financialOnly",
    "minimumAmount",
    "amountGreaterThan",
    "pattern",
    "excludePattern",
    "mode",
  ]);
  for (const rule of classification.rules) {
    if (!rule || Object.keys(rule).some((key) => !ruleFields.has(key)))
      throw new RangeError("Unknown classification rule field");
    if (
      !rule.code ||
      codes.has(rule.code) ||
      !policy.priorities[rule.priority] ||
      (rule.mode && !["set", "raise"].includes(rule.mode))
    )
      throw new RangeError("Invalid classification rule");
    codes.add(rule.code);
    for (const field of ["isDispute", "financialOnly"])
      if (rule[field] !== undefined && typeof rule[field] !== "boolean")
        throw new RangeError(`Invalid ${field}`);
    for (const field of ["pattern", "excludePattern"])
      if (rule[field] !== undefined) {
        if (typeof rule[field] !== "string" || !rule[field])
          throw new RangeError(`Invalid ${field}`);
        new RegExp(rule[field], "u");
      }
    for (const field of ["minimumAmount", "amountGreaterThan"])
      if (
        rule[field] !== undefined &&
        (!Number.isFinite(rule[field]) || rule[field] < 0)
      )
        throw new RangeError(`Invalid ${field}`);
  }
  for (const field of [
    "rankWeight",
    "amountDivisor",
    "maximumAmountScore",
    "reportWeight",
    "maximumReportScore",
    "overdueScore",
  ])
    positiveInteger(policy.scoring?.[field], `scoring.${field}`);
  let previous = 0;
  if (!Array.isArray(policy.scoring.urgency) || !policy.scoring.urgency.length)
    throw new RangeError("Urgency thresholds are required");
  for (const threshold of policy.scoring.urgency) {
    positiveInteger(threshold.remainingMinutes, "remainingMinutes");
    positiveInteger(threshold.score, "urgency score");
    if (threshold.remainingMinutes <= previous)
      throw new RangeError("Urgency thresholds must increase");
    previous = threshold.remainingMinutes;
  }
  const maximumTieBreaker =
    policy.scoring.maximumAmountScore +
    policy.scoring.maximumReportScore +
    Math.max(
      policy.scoring.overdueScore,
      ...policy.scoring.urgency.map((entry) => entry.score),
    );
  if (maximumTieBreaker >= policy.scoring.rankWeight)
    throw new RangeError("Tie-breakers must not outweigh a priority rank");
  return policy;
}

function readConfig(file, fallback) {
  return file
    ? JSON.parse(fs.readFileSync(file, "utf8"))
    : structuredClone(fallback);
}

const loadedPolicy = validatePolicy(
  readConfig(process.env.CS_POLICY_FILE, defaults),
);
if (
  loadedPolicy.version === defaults.version &&
  !isDeepStrictEqual(loadedPolicy, defaults)
)
  throw new RangeError(
    "Changed policy must use a new version; existing SLA snapshots are immutable",
  );
const customerServicePolicy = freeze(loadedPolicy);
const customerServiceClientConfig = freeze(
  validateClientConfig(
    readConfig(process.env.CS_CLIENT_CONFIG_FILE, clientDefaults),
  ),
);

function envInteger(name, fallback) {
  const value =
    process.env[name] === undefined ? fallback : Number(process.env[name]);
  positiveInteger(value, name);
  return value;
}

const customerServiceRuntime = Object.freeze({
  dependencyTimeoutMs: envInteger("CS_DEPENDENCY_TIMEOUT_MS", 3000),
  chatTimeoutMs: envInteger("CS_CHAT_TIMEOUT_MS", 5000),
  slaMonitorIntervalMs: envInteger("CS_SLA_MONITOR_INTERVAL_MS", 60000),
  transactionAttempts: envInteger("CS_TRANSACTION_ATTEMPTS", 3),
  syncPollIntervalMs: envInteger("CS_SYNC_POLL_INTERVAL_MS", 5000),
  syncInitialBackoffMs: envInteger("CS_SYNC_INITIAL_BACKOFF_MS", 1000),
  syncMaxBackoffMs: envInteger("CS_SYNC_MAX_BACKOFF_MS", 60000),
});
if (
  customerServiceRuntime.syncMaxBackoffMs <
  customerServiceRuntime.syncInitialBackoffMs
)
  throw new RangeError(
    "Maximum sync backoff must not be smaller than initial backoff",
  );

module.exports = {
  customerServicePolicy,
  customerServiceClientConfig,
  customerServiceRuntime,
  validatePolicy,
  validateClientConfig,
  envInteger,
};
