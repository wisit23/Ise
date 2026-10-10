const {
  classifyCase,
  getServicePolicy,
  addMinutes,
  SERVICE_POLICIES,
} = require("@reloop/shared");
const SLA_TARGET_MS = Object.fromEntries(
  Object.entries(SERVICE_POLICIES).map(([key, policy]) => [
    key,
    policy.resolutionMinutes * 60000,
  ]),
);
function calculatePriority({ orderAmount = 0, ...input } = {}) {
  return classifyCase({ ...input, amount: orderAmount }).priority;
}
function calculateSlaDueAt(priority, from = new Date(), metric = "RESOLUTION") {
  const policy = getServicePolicy(priority);
  if (!["FIRST_RESPONSE", "RESOLUTION"].includes(metric))
    throw new RangeError("Unknown SLA metric");
  return addMinutes(
    from,
    metric === "FIRST_RESPONSE"
      ? policy.firstResponseMinutes
      : policy.resolutionMinutes,
  );
}
module.exports = { calculatePriority, calculateSlaDueAt, SLA_TARGET_MS };
