// Thin service-to-service client toward chat-service's Internal API
// (CHAT-005) — order status notifications are best-effort, while opening a
// dispute room reports a service error to the caller so the UI can retry.
const { AppError } = require("@reloop/shared");
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
    signal: AbortSignal.timeout(5000),
    headers: {
      "Content-Type": "application/json",
      "x-internal-token": INTERNAL_TOKEN,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`chat-service ${path} returned ${res.status}`);
  return res.json();
}

async function internalPatch(path, body) {
  const res = await fetch(`${CHAT_SERVICE_URL}${path}`, {
    method: "PATCH",
    signal: AbortSignal.timeout(5000),
    headers: {
      "Content-Type": "application/json",
      "x-internal-token": INTERNAL_TOKEN,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`chat-service ${path} returned ${res.status}`);
  return res.json();
}

// The unique DISPUTE context key makes this safe to retry after a timeout.
// Order-service decides membership; the browser never supplies participants.
async function joinDisputeConversation(dispute, order, actor) {
  try {
    const conversation = await internalPost("/internal/conversations", {
      contextType: "DISPUTE",
      contextId: dispute.id,
      createdBy: order.buyerId,
      participants: [
        { userId: order.buyerId, role: "BUYER" },
        { userId: order.sellerId, role: "SELLER" },
      ],
    });
    if (actor.role !== "BUYER" && actor.role !== "SELLER") {
      await internalPost(
        `/internal/conversations/${conversation.id}/participants`,
        {
          userId: actor.userId,
          role: actor.role,
        },
      );
    }
    if (dispute.status === "DECIDED") {
      await internalPatch(`/internal/conversations/${conversation.id}/status`, {
        status: "LOCKED",
      });
    }
    return conversation.id;
  } catch (err) {
    throw new AppError(503, `dispute chat is unavailable: ${err.message}`);
  }
}

async function lockDisputeConversation(dispute, order) {
  await joinDisputeConversation(dispute, order, {
    userId: order.buyerId,
    role: "BUYER",
  });
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
  joinDisputeConversation,
  lockDisputeConversation,
};
