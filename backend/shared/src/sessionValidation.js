const { AppError } = require("./errors");

function sessionError(status, code, message) {
  return Object.assign(new AppError(status, message), { code });
}

function sessionUnavailable() {
  return sessionError(
    503,
    "AUTH_UNAVAILABLE",
    "ไม่สามารถตรวจสอบสถานะบัญชีได้ กรุณาลองใหม่",
  );
}

// No positive cache: a successful check from before a suspension must not
// authorize the next request after the suspension commits.
async function validateRemoteSession(_payload, token) {
  const internalToken = process.env.INTERNAL_SERVICE_TOKEN;
  if (!internalToken) throw sessionUnavailable();
  const baseUrl = process.env.AUTH_SERVICE_URL || "http://auth-service:3001";
  try {
    const response = await fetch(`${baseUrl}/internal/sessions/validate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-token": internalToken,
      },
      body: JSON.stringify({ accessToken: token }),
      signal: AbortSignal.timeout(3000),
    });
    const data = await response.json();
    if (response.ok && data.active === true) return;
    if (
      (response.status === 401 && data.code === "SESSION_REVOKED") ||
      (response.status === 403 && data.code === "ACCOUNT_SUSPENDED")
    ) {
      throw sessionError(response.status, data.code, data.error);
    }
    throw sessionUnavailable();
  } catch (error) {
    if (["SESSION_REVOKED", "ACCOUNT_SUSPENDED"].includes(error.code))
      throw error;
    throw sessionUnavailable();
  }
}

module.exports = { sessionError, sessionUnavailable, validateRemoteSession };
