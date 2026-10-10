// Thin service-to-service client toward chat-service's Internal API
// (CHAT-005). Every call here is best-effort: a chat notification failing
// must never fail the order status transition or checkout itself, so every
// function swallows its own errors instead of throwing back.
const CHAT_SERVICE_URL =
  process.env.CHAT_SERVICE_URL || "http://chat-service:3004";
const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || "";

const STATUS_MESSAGE_TH = {
  confirmed: "ยืนยันคำสั่งซื้อแล้ว (รอจัดส่ง)",
  shipped: "ผู้ขายจัดส่งสินค้าแล้ว กรุณากดยืนยันเมื่อได้รับสินค้า",
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

/**
 * Posts a SYSTEM message into the PRODUCT conversation (the room that has the
 * product banner header the user can tap to open the listing). All order
 * notifications land here — one room, one notification, always clickable.
 *
 * Falls back silently: a chat outage must never fail the order flow itself.
 */
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
    body: `🛒 ผู้ซื้อทำการซื้อสินค้า '${title}' และชำระเงินเรียบร้อยแล้ว | หมายเลขคำสั่งซื้อ: #${order.id}`,
    payload: {
      event: "order.paid",
      orderId: order.id,
      productId: order.productId,
      status: "confirmed",
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
      ? `📦 ผู้ขายจัดส่งสินค้าแล้ว กรุณากดยืนยันเมื่อได้รับสินค้า | หมายเลขคำสั่งซื้อ: #${order.id}`
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

module.exports = {
  notifyOrderPlaced,
  notifyOrderPaid,
  notifyOrderStatusChanged,
};
