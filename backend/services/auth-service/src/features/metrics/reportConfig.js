function positiveIntegerEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  if (
    !/^\d+$/.test(raw) ||
    !Number.isSafeInteger(Number(raw)) ||
    Number(raw) < 1
  ) {
    throw new Error(`${name} must be a positive integer`);
  }
  return Number(raw);
}

const DEFAULT_REPORT_LIMIT = positiveIntegerEnv(
  "EXECUTIVE_REPORT_DEFAULT_LIMIT",
  50,
);
const MAX_REPORT_LIMIT = positiveIntegerEnv("EXECUTIVE_REPORT_MAX_LIMIT", 100);
const ANOMALY_THRESHOLD = positiveIntegerEnv(
  "EXECUTIVE_REPORT_ANOMALY_THRESHOLD",
  3,
);
if (DEFAULT_REPORT_LIMIT > MAX_REPORT_LIMIT) {
  throw new Error(
    "EXECUTIVE_REPORT_DEFAULT_LIMIT must not exceed EXECUTIVE_REPORT_MAX_LIMIT",
  );
}
module.exports = { DEFAULT_REPORT_LIMIT, MAX_REPORT_LIMIT, ANOMALY_THRESHOLD };
