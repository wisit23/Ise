// Service-to-service client toward auth-service, following the pattern
// in order-service/src/services/productClient.js.
const { AppError } = require("@reloop/shared");

const AUTH_SERVICE_URL =
  process.env.AUTH_SERVICE_URL || "http://auth-service:3001";
const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || "";
const REQUEST_TIMEOUT_MS = Number(process.env.AUTH_SERVICE_TIMEOUT_MS || 5000);

let mockUserResolver = null;

function setMockUserResolver(fn) {
  mockUserResolver = fn;
}

async function getUser(userId) {
  if (mockUserResolver) {
    return mockUserResolver(userId);
  }
  let res;
  try {
    res = await fetch(`${AUTH_SERVICE_URL}/internal/users/${userId}`, {
      headers: { "x-internal-token": INTERNAL_TOKEN },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new AppError(502, "auth-service is unreachable");
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new AppError(502, "auth-service returned an error");
  return res.json();
}

module.exports = {
  getUser,
  setMockUserResolver,
};
