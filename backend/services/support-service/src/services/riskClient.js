const { customerServiceRuntime } = require("@reloop/shared");
const AUTH_SERVICE_URL =
  process.env.AUTH_SERVICE_URL || "http://auth-service:3001";

async function getReportCount(userId) {
  if (!userId) return 0;
  const response = await fetch(
    `${AUTH_SERVICE_URL}/internal/users/${encodeURIComponent(userId)}`,
    {
      headers: { "x-internal-token": process.env.INTERNAL_SERVICE_TOKEN || "" },
      signal: AbortSignal.timeout(customerServiceRuntime.dependencyTimeoutMs),
    },
  );
  if (!response.ok) throw new Error(`auth-service returned ${response.status}`);
  const user = await response.json();
  return Math.max(0, Number(user.reportCount) || 0);
}

module.exports = { getReportCount };
