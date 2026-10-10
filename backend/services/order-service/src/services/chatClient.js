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

// Each party has a separate room. The actor can only request their own side;
// order-service decides membership and chat-service rechecks it on every read.
async function joinDisputeConversation(dispute, order, actor, side) {
  const contextType = side === "seller" ? "DISPUTE_SELLER" : "DISPUTE_BUYER";
  const partyId = side === "seller" ? order.sellerId : order.buyerId;
  const partyRole = side === "seller" ? "SELLER" : "BUYER";
  try {
    const conversation = await internalPost("/internal/conversations", {
      contextType,
      contextId: dispute.id,
      createdBy: partyId,
      participants: [{ userId: partyId, role: partyRole }],
    });
    if (actor.userId !== partyId) {
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
  await Promise.all(["buyer", "seller"].map((side) =>
    joinDisputeConversation(dispute, order, {
      userId: side === "buyer" ? order.buyerId : order.sellerId,
      role: side === "buyer" ? "BUYER" : "SELLER",
    }, side),
  ));
}

async function internalGet(path, { allowMissing = false } = {}) {
  const res = await fetch(`${CHAT_SERVICE_URL}${path}`, {
    signal: AbortSignal.timeout(5000),
    headers: { "x-internal-token": INTERNAL_TOKEN },
  });
  if (allowMissing && res.status === 404) return null;
  if (!res.ok) throw new AppError(503, `chat-service ${path} returned ${res.status}`);
  return res.json();
}

async function getDisputeTranscript(disputeId, side, before) {
  const type = side === "legacy" ? "DISPUTE" : side === "seller" ? "DISPUTE_SELLER" : "DISPUTE_BUYER";
  const room = await internalGet(`/internal/conversations/by-context/${type}/${encodeURIComponent(disputeId)}`, { allowMissing: true });
  if (!room) return { messages: [], nextCursor: null };
  const query = new URLSearchParams({ limit: "100", includeInternal: "true" });
  if (before) query.set("before", before);
  return internalGet(`/internal/conversations/${encodeURIComponent(room.id)}/transcript?${query}`);
}

async function sendDisputeNotice(dispute, order, eventKey, body) {
  await Promise.all(["buyer", "seller"].map(async (side) => {
    const partyId = side === "buyer" ? order.buyerId : order.sellerId;
    const conversationId = await joinDisputeConversation(dispute, order, {
      userId: partyId, role: side === "buyer" ? "BUYER" : "SELLER",
    }, side);
    await internalPost(`/internal/conversations/${conversationId}/messages`, {
      senderId: "system", senderRole: "SYSTEM", type: "SYSTEM", body,
      eventKey: `${dispute.id}:${eventKey}`,
      payload: { disputeId: dispute.id, event: eventKey },
    });
  }));
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
  getDisputeTranscript,
  sendDisputeNotice,
};
