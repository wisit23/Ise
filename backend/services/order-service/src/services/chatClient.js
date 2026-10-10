// Thin service-to-service client toward chat-service's Internal API
// (CHAT-005) — the first real consumer of it. Every call here is
// best-effort: a chat notification failing must never fail the order status
// transition itself, so every function swallows its own errors instead of
// throwing back into orderController.
const CHAT_SERVICE_URL =
  process.env.CHAT_SERVICE_URL || "http://chat-service:3004";
const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || "";

// Only order statuses worth telling both parties about in the room get a
// SYSTEM message — "pending" (still in the cart) isn't chat-worthy.
const STATUS_MESSAGE_TH = {
  confirmed: "ผู้ขายยืนยันคำสั่งซื้อแล้ว",
  shipped: "ผู้ขายจัดส่งสินค้าแล้ว",
  completed: "คำสั่งซื้อเสร็จสมบูรณ์แล้ว",
  cancelled: "คำสั่งซื้อนี้ถูกยกเลิกแล้ว",
};

async function internalPost(path, body) {
  const res = await fetch(`${CHAT_SERVICE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-token": INTERNAL_TOKEN,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`chat-service ${path} returned ${res.status}`);
  return res.json();
}

async function internalGet(path) {
  const res = await fetch(`${CHAT_SERVICE_URL}${path}`, {
    headers: { "x-internal-token": INTERNAL_TOKEN },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`chat-service ${path} returned ${res.status}`);
  return res.json();
}

async function getOrderTranscript(orderId, { before, limit = 30 } = {}) {
  const conversation = await internalGet(
    `/internal/conversations/by-context/ORDER/${encodeURIComponent(orderId)}`,
  );
  if (!conversation) return null;
  const params = new URLSearchParams({ limit: String(limit) });
  if (before) params.set("before", before);
  const transcript = await internalGet(
    `/internal/conversations/${conversation.id}/transcript?${params}`,
  );
  return transcript ? { ...transcript, conversation } : null;
}

async function getOrderAttachment(orderId, messageId) {
  const conversation = await internalGet(
    `/internal/conversations/by-context/ORDER/${encodeURIComponent(orderId)}`,
  );
  if (!conversation) return null;
  const res = await fetch(
    `${CHAT_SERVICE_URL}/internal/conversations/${conversation.id}/attachments/${encodeURIComponent(messageId)}`,
    { headers: { "x-internal-token": INTERNAL_TOKEN } },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`chat-service attachment returned ${res.status}`);
  return {
    conversation,
    bytes: Buffer.from(await res.arrayBuffer()),
    contentType: res.headers.get("content-type") || "application/octet-stream",
    contentDisposition: res.headers.get("content-disposition") || null,
  };
}

/**
 * Opens (or reopens) the ORDER-context conversation and drops a SYSTEM
 * message into it for a status this app considers chat-worthy. Called from
 * orderController.updateStatus — see the comment there on why it's awaited
 * rather than fire-and-forget despite being best-effort.
 */
async function notifyOrderStatusChanged(order, status) {
  const messageBody = STATUS_MESSAGE_TH[status];
  if (!messageBody) return;

  try {
    const conversation = await internalPost("/internal/conversations", {
      contextType: "ORDER",
      contextId: order.id,
      createdBy: "system",
      participants: [
        { userId: order.buyerId, role: "BUYER" },
        { userId: order.sellerId, role: "SELLER" },
      ],
    });

    await internalPost(`/internal/conversations/${conversation.id}/messages`, {
      senderId: "system",
      senderRole: "SYSTEM",
      type: "SYSTEM",
      body: messageBody,
      payload: { event: `order.${status}`, orderId: order.id },
    });
  } catch (err) {
    console.error(
      `[order-service] chat notification failed for order ${order.id} (${status}):`,
      err.message,
    );
  }
}

module.exports = {
  notifyOrderStatusChanged,
  getOrderTranscript,
  getOrderAttachment,
};
