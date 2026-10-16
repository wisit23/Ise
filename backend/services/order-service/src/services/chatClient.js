async function resolveTradingConversation(orderId,{productId,buyerId,source="CURRENT"}={}){
  if(!["CURRENT","ORDER"].includes(source))throw new AppError(400,"invalid chat source");
  if(source!=="ORDER" && productId && buyerId){
    const room=await internalGet(`/internal/conversations/by-context/PRODUCT/${encodeURIComponent(productId)}?buyerId=${encodeURIComponent(buyerId)}`,{allowMissing:true});if(room)return room;
  }
  return internalGet(`/internal/conversations/by-context/ORDER/${encodeURIComponent(orderId)}`,{allowMissing:true});
}
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
  ready_to_ship: "ผู้ขายเตรียมสินค้าแล้ว รอขนส่งมารับ",
  shipped: "ผู้ขายจัดส่งสินค้าแล้ว",
  delivered: "ขนส่งส่งสินค้าถึงผู้ซื้อแล้ว",
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
async function getOrderTranscript(orderId, { before, limit = 30, productId,buyerId,source } = {}) {
  const conversation = await resolveTradingConversation(orderId,{productId,buyerId,source});
  if (!conversation) return null;
  const params = new URLSearchParams({ limit: String(limit) });
  if (before) params.set("before", before);
  const transcript = await internalGet(
    `/internal/conversations/${conversation.id}/transcript?${params}`,
  );
  return transcript ? { ...transcript, conversation } : null;
}

async function getOrderAttachment(orderId, messageId, options = {}) {
  const conversation = await resolveTradingConversation(orderId,options);
  if (!conversation) return null;
  const res = await fetch(
    `${CHAT_SERVICE_URL}/internal/conversations/${conversation.id}/attachments/${encodeURIComponent(messageId)}`,
    { headers: { "x-internal-token": INTERNAL_TOKEN }, signal:AbortSignal.timeout(5000) },
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

module.exports = {
  notifyOrderPlaced,notifyOrderPaid,
  getOrderTranscript, getOrderAttachment,
  notifyOrderStatusChanged,
  joinDisputeConversation,
  lockDisputeConversation,
  getDisputeTranscript,
  sendDisputeNotice,
};

async function postToProductRoom({ order, body, payload }) {
  if (!order.productId) return;
  try {
    const conversation = await internalPost("/internal/conversations", {
      contextType: "PRODUCT",
      contextId: order.productId,
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
      body,
      payload,
      idempotencyKey:`${payload.event}:${order.id}:${order.version || 0}`,
    });
  } catch (err) {
    console.error(
      `[order-service] chat notification failed for PRODUCT:${order.productId} (order ${order.id}):`,
      err.message,
    );
  }
}

/**
 * Notifies the seller in the PRODUCT chat room when a new order is placed.
 */
async function notifyOrderPlaced(order) {
  if (!order || !order.id || !order.buyerId || !order.sellerId || !order.productId) return;

  const title = order.productTitle || "สินค้า";
  await postToProductRoom({
    order,
    body: `🛒 มีการสั่งซื้อสินค้า '${title}' | หมายเลขคำสั่งซื้อ: #${order.id}`,
    payload: {
      event: "order.placed",
      orderId: order.id,
      productId: order.productId,
      productTitle: order.productTitle,
      price: order.price,
      status: order.status || "pending_payment",
    },
  });
}

/**
 * Notifies the seller in the PRODUCT chat room when payment is completed.
 */
async function notifyOrderPaid(order) {
  if (!order || !order.id || !order.buyerId || !order.sellerId || !order.productId) return;

  const title = order.productTitle || "สินค้า";
  await postToProductRoom({
    order,
    body: `🛒 ผู้ซื้อทำการซื้อสินค้า '${title}' และชำระเงินเรียบร้อยแล้ว กรุณายืนยันคำสั่งซื้อภายใน 1 วัน | หมายเลขคำสั่งซื้อ: #${order.id}`,
    payload: {
      event: "order.paid",
      orderId: order.id,
      productId: order.productId,
      status: "paid",
    },
  });
}

/**
 * Notifies parties in the PRODUCT chat room when order status changes.
 */
async function notifyOrderStatusChanged(order, status) {
  const statusLabel = STATUS_MESSAGE_TH[status];
  if (!statusLabel || !order || !order.id || !order.productId) return;

  const body =
    status === "shipped"
      ? `📦 ผู้ขายจัดส่งสินค้าแล้ว | หมายเลขคำสั่งซื้อ: #${order.id}`
      : status === "delivered"
        ? `📬 สินค้าถึงผู้ซื้อแล้ว กรุณากดยืนยันเมื่อได้รับสินค้า (ระบบจะยืนยันให้อัตโนมัติใน 14 วัน) | หมายเลขคำสั่งซื้อ: #${order.id}`
        : `คำสั่งซื้อ #${order.id}: ${statusLabel}`;

  await postToProductRoom({
    order,
    body,
    payload: {
      event: `order.${status}`,
      orderId: order.id,
      productId: order.productId,
      status,
    },
  });
}
