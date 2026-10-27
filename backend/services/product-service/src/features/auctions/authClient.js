const AUTH_SERVICE_URL =
  process.env.AUTH_SERVICE_INTERNAL_URL ||
  process.env.AUTH_SERVICE_URL ||
  "http://auth-service:3001";
const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || "";

const CHUNK_SIZE = 100;

async function fetchChunk(userIds) {
  const res = await fetch(`${AUTH_SERVICE_URL}/internal/users/display-names`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-token": INTERNAL_TOKEN,
    },
    body: JSON.stringify({ userIds }),
  });
  if (!res.ok) throw new Error(`auth-service returned ${res.status}`);
  return res.json();
}

/**
 * Best-effort display name resolution for user/bidder IDs.
 * Returns a Map(userId -> displayName).
 */
async function getDisplayNames(userIds) {
  const unique = [...new Set((userIds || []).filter(Boolean))];
  const names = new Map();
  if (unique.length === 0) return names;

  const chunks = [];
  for (let i = 0; i < unique.length; i += CHUNK_SIZE) {
    chunks.push(unique.slice(i, i + CHUNK_SIZE));
  }

  try {
    const results = await Promise.all(chunks.map(fetchChunk));
    for (const entry of results.flat()) {
      if (entry?.userId && entry.displayName) {
        names.set(entry.userId, entry.displayName);
      }
    }
  } catch {
    // Non-fatal, gracefully fall back
  }

  return names;
}

function maskBidderName(userId) {
  if (!userId) return "ผู้ใช้นิรนาม";
  if (userId.length <= 6) return `ผู้ใช้ ${userId}`;
  return `ผู้ใช้ ${userId.slice(-6)}`;
}

module.exports = {
  getDisplayNames,
  maskBidderName,
};
