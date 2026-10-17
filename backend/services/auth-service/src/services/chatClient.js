const CHAT_SERVICE_URL =
  process.env.CHAT_SERVICE_URL || "http://chat-service:3004";
const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || "";

async function sendSystemNotification({
  userId,
  type,
  title,
  message,
  link,
  metadata,
  entityId,
}) {
  try {
    const res = await fetch(`${CHAT_SERVICE_URL}/internal/notifications`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-token": INTERNAL_TOKEN,
      },
      body: JSON.stringify({
        userId,
        type,
        title,
        message,
        link,
        metadata,
        entityId,
      }),
    });
    if (!res.ok) {
      console.error(
        `[auth-service] sendSystemNotification returned ${res.status}`,
      );
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error(`[auth-service] notification failed: ${err.message}`);
    return null;
  }
}

module.exports = { sendSystemNotification };
