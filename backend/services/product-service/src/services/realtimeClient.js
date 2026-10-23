// Best-effort HTTP client toward chat-service's internal realtime broadcast API.
// Failures are logged and swallowed so real-time push issues never fail product writes.
const CHAT_SERVICE_URL =
  process.env.CHAT_SERVICE_URL || "http://chat-service:3004";
const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || "";

async function sendBroadcast({ event, data, rooms = [], broadcastGlobal = false }) {
  try {
    const res = await fetch(`${CHAT_SERVICE_URL}/internal/realtime/broadcast`, {
      method: "POST",
      signal: AbortSignal.timeout(3000),
      headers: {
        "Content-Type": "application/json",
        "x-internal-token": INTERNAL_TOKEN,
      },
      body: JSON.stringify({ event, data, rooms, broadcastGlobal }),
    });
    if (!res.ok) {
      console.warn(`[realtimeClient] broadcast returned status ${res.status}`);
    }
  } catch (err) {
    console.warn(`[realtimeClient] broadcast failed for ${event}:`, err.message);
  }
}

function broadcastProductCreated(product) {
  if (!product) return;
  const rooms = product.sellerId ? [`user:${product.sellerId}`] : [];
  sendBroadcast({
    event: "product:created",
    data: { product },
    rooms,
    broadcastGlobal: true,
  });
}

function broadcastProductUpdated(product, action = "updated") {
  if (!product) return;
  const rooms = product.sellerId ? [`user:${product.sellerId}`] : [];
  sendBroadcast({
    event: "product:updated",
    data: { product, action },
    rooms,
    broadcastGlobal: true,
  });
}

function broadcastProductDeleted(productId, sellerId) {
  if (!productId) return;
  const rooms = sellerId ? [`user:${sellerId}`] : [];
  sendBroadcast({
    event: "product:deleted",
    data: { productId, sellerId },
    rooms,
    broadcastGlobal: true,
  });
}

module.exports = {
  broadcastProductCreated,
  broadcastProductUpdated,
  broadcastProductDeleted,
};
