const { AppError } = require("@reloop/shared");

const AUTH_SERVICE_URL =
  process.env.AUTH_SERVICE_INTERNAL_URL ||
  process.env.AUTH_SERVICE_URL ||
  "http://auth-service:3001";
const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || "";

/**
 * Searches users across auth-service boundary using the internal service token.
 * Fail-closed: If auth-service is unreachable or returns an error, throws 502 Bad Gateway
 * so operator searches do not fall back to unfiltered logs or incorrect data.
 *
 * @param {string} q Search query (name, partial name, or ID)
 * @returns {Promise<Array<{ id: string, userId: string, displayName: string }>>}
 */
async function searchUsers(q) {
  if (!q || typeof q !== "string" || !q.trim()) {
    return [];
  }

  const query = q.trim();
  const url = `${AUTH_SERVICE_URL}/internal/users/search`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-token": INTERNAL_TOKEN,
      },
      body: JSON.stringify({ q: query }),
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) {
      throw new AppError(
        502,
        "ไม่สามารถเชื่อมต่อระบบผู้ใช้งาน (auth-service) เพื่อค้นหาได้ กรุณาลองใหม่อีกครั้ง",
      );
    }

    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(
      502,
      "ไม่สามารถเชื่อมต่อระบบผู้ใช้งาน (auth-service) เพื่อค้นหาได้ กรุณาลองใหม่อีกครั้ง",
    );
  }
}

/**
 * Batch resolve display names for a list of user IDs.
 * Called only through /internal with internal token.
 * Best-effort for listing view: if a user is deleted or auth-service is temporarily unavailable,
 * returns whatever names could be resolved without blocking audit trail access.
 *
 * @param {string[]} userIds
 * @returns {Promise<Array<{ userId: string, displayName: string }>>}
 */
async function getDisplayNames(userIds) {
  const ids = [...new Set(userIds.filter((id) => typeof id === "string" && id.trim() && id !== "SYSTEM"))];
  if (ids.length === 0) return [];

  const results = [];
  // Split into chunks of 100 per auth-service max limit
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    try {
      const res = await fetch(`${AUTH_SERVICE_URL}/internal/users/display-names`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-token": INTERNAL_TOKEN,
        },
        body: JSON.stringify({ userIds: chunk }),
        signal: AbortSignal.timeout(3000),
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          results.push(...data);
        }
      }
    } catch (err) {
      // Best-effort enrichment on read: continue to allow fallback to ID
      console.warn("[marketingAuditAuthClient] getDisplayNames warning:", err.message);
    }
  }

  return results;
}

module.exports = {
  searchUsers,
  getDisplayNames,
};
