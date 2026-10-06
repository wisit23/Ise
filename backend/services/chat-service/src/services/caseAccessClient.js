const { AppError } = require("@reloop/shared");

const OWNERS = {
  DISPUTE: {
    url: process.env.ORDER_SERVICE_URL || "http://order-service:3003",
    path: (id, userId) => `/internal/disputes/${encodeURIComponent(id)}/chat-access/${encodeURIComponent(userId)}`,
  },
  SUPPORT: {
    url: process.env.SUPPORT_SERVICE_URL || "http://support-service:3006",
    path: (id, userId) => `/internal/tickets/${encodeURIComponent(id)}/chat-access/${encodeURIComponent(userId)}`,
  },
};

async function getCaseAccess(conversation, userId, role) {
  const owner = OWNERS[conversation.contextType];
  if (!owner) return { allowed: true, writable: true };
  if (!conversation.contextId) throw new AppError(503, "case chat has no context ID");
  try {
    const url = `${owner.url}${owner.path(conversation.contextId, userId)}?role=${encodeURIComponent(role)}`;
    const response = await fetch(url, {
      headers: { "x-internal-token": process.env.INTERNAL_SERVICE_TOKEN || "" },
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) throw new Error(`case owner returned ${response.status}`);
    const access = await response.json();
    if (typeof access.allowed !== "boolean" || typeof access.writable !== "boolean") {
      throw new Error("invalid case access response");
    }
    return access;
  } catch (err) {
    throw new AppError(503, `case access check unavailable: ${err.message}`);
  }
}

module.exports = { getCaseAccess };
