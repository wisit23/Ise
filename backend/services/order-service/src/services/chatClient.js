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
      payload: {
        disputeId: dispute.id,
        event: eventKey,
        orderId: order.id,
        productId: order.productId,
        productTitle: order.productTitle,
        price: order.price || order.finalPrice,
      },
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
  notifyOrderPlaced,
  notifyOrderPaid,
  notifyOrderConfirmed,
  notifyOrderRejected,
  getOrderTranscript,
  getOrderAttachment,
  notifyOrderStatusChanged,
  notifyDisputeOpened,
  joinDisputeConversation,
  lockDisputeConversation,
  getDisputeTranscript,
  sendDisputeNotice,
  sendSystemNotification,
  deleteDisputeConversation,
  broadcastOrderRealtime,
};

async function sendSystemNotification({ userId, type, title, message, link, metadata, entityId }) {
  try {
    await internalPost("/internal/notifications", {
      userId,
      type,
      title,
      message,
      link,
      metadata,
      entityId,
    });
  } catch (err) {
    console.error(
      `[order-service] notification failed for user ${userId}:`,
      err.message,
    );
  }
}

/**
 * Does NOT notify seller on cart addition or reservation.
 * Per requirement: "เมื่อผู้ซื้อกดซื้อสินค้ามันจะแจ้งเตือนในขั้นตอนที่ผู้ซื้อกดชำระเงินแล้วเท่านั้น ก่อนหน้านั้นกดจอง หรือกดใส่ตะกร้าจะไม่แจ้งเตือนผู้ขาย"
 */
async function notifyOrderPlaced(order) {
  if (order && order.buyerId) {
    try {
      await internalPost("/internal/realtime/broadcast", {
        event: "order:updated",
        data: { order, action: "created" },
        rooms: [`user:${order.buyerId}`],
        broadcastGlobal: false,
      });
    } catch (_) {}
  }
}

/**
 * Notifies both seller and buyer in the Notification Center when payment is completed.
 * For seller: links directly to the product page with ?ship=1 to fulfill shipment.
 * Uses entityId: order.id to update stages in-place.
 */
async function notifyOrderPaid(order) {
  if (!order || !order.id || !order.buyerId || !order.sellerId) return;

  const title = order.productTitle || "สินค้า";
  const tasks = [
    sendSystemNotification({
      userId: order.sellerId,
      type: "ORDER",
      title: "ผู้ซื้อชำระเงินแล้ว",
      message: `💰 ผู้ซื้อชำระเงินสำหรับสินค้า '${title}' เรียบร้อยแล้ว กรุณาดำเนินการตรวจสอบและยืนยันออเดอร์ | หมายเลขคำสั่งซื้อ: #${order.id}`,
      link: `/seller/dashboard?section=orders&orderId=${order.id}`,
      metadata: {
        orderId: order.id,
        productId: order.productId,
        auctionId: order.auctionId,
        status: "paid",
      },
      entityId: order.id,
    }),
    broadcastOrderRealtime(order, "paid"),
  ];

  if (order.buyerId !== order.sellerId) {
    tasks.push(
      sendSystemNotification({
        userId: order.buyerId,
        type: "ORDER",
        title: "ชำระเงินสำเร็จ",
        message: `✅ คุณได้ชำระเงินสำหรับสินค้า '${title}' เรียบร้อยแล้ว รอผู้ขายยืนยันคำสั่งซื้อ | หมายเลขคำสั่งซื้อ: #${order.id}`,
        link: `/orders?orderId=${order.id}`,
        metadata: {
          orderId: order.id,
          productId: order.productId,
          auctionId: order.auctionId,
          status: "paid",
        },
        entityId: order.id,
      })
    );
  }

  await Promise.all(tasks);
}

async function notifyOrderConfirmed(order) {
  if (!order || !order.id || !order.buyerId || !order.sellerId) return;
  const title = order.productTitle || "สินค้า";
  const tasks = [
    sendSystemNotification({
      userId: order.buyerId,
      type: "ORDER",
      title: "ผู้ขายยืนยันคำสั่งซื้อแล้ว",
      message: `📦 ผู้ขายยืนยันคำสั่งซื้อ #${order.id} ('${title}') แล้ว กำลังเตรียมการจัดส่งสินค้า`,
      link: `/orders?orderId=${order.id}`,
      metadata: {
        orderId: order.id,
        productId: order.productId,
        auctionId: order.auctionId,
        status: "confirmed",
      },
      entityId: order.id,
    }),
  ];

  if (order.sellerId !== order.buyerId) {
    tasks.push(
      sendSystemNotification({
        userId: order.sellerId,
        type: "ORDER",
        title: "ยืนยันคำสั่งซื้อสำเร็จ",
        message: `✅ คุณได้ยืนยันคำสั่งซื้อ #${order.id} ('${title}') แล้ว กรุณาดำเนินการจัดส่งสินค้า`,
        link: `/seller/dashboard?section=orders&orderId=${order.id}`,
        metadata: {
          orderId: order.id,
          productId: order.productId,
          auctionId: order.auctionId,
          status: "confirmed",
        },
        entityId: order.id,
      })
    );
  }

  tasks.push(broadcastOrderRealtime(order, "confirmed"));

  await Promise.all(tasks);
}

async function notifyOrderRejected(order, reason) {
  if (!order || !order.id || !order.buyerId) return;
  const title = order.productTitle || "สินค้า";
  const amount = Number(order.ordersAmount || order.price || 0).toLocaleString("th-TH");
  const reasonText = reason ? ` (เหตุผล: ${reason})` : "";
  const tasks = [
    sendSystemNotification({
      userId: order.buyerId,
      type: "ORDER",
      title: "คำสั่งซื้อถูกปฏิเสธและคืนเงินเต็มจำนวน",
      message: `❌ ผู้ขายได้ปฏิเสธออเดอร์ #${order.id} ('${title}')${reasonText} — ระบบได้ทำการคืนเงินเต็มจำนวน ฿${amount} ให้กับคุณเรียบร้อยแล้ว`,
      link: `/orders?orderId=${order.id}`,
      metadata: {
        orderId: order.id,
        productId: order.productId,
        status: "cancelled",
        refundAmount: amount,
        reason,
      },
      entityId: order.id,
    }),
    broadcastOrderRealtime({ ...order, status: "cancelled" }, "rejected"),
  ];
  await Promise.all(tasks);
}

async function deleteDisputeConversation(disputeId) {
  try {
    const res = await fetch(
      `${CHAT_SERVICE_URL}/internal/conversations/by-context/DISPUTE/${encodeURIComponent(disputeId)}`,
      {
        method: "DELETE",
        signal: AbortSignal.timeout(5000),
        headers: { "x-internal-token": INTERNAL_TOKEN },
      },
    );
    if (!res.ok) throw new Error(`chat-service delete failed with status ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error(`[chatClient] deleteDisputeConversation error for dispute ${disputeId}:`, err.message);
    return null;
  }
}

/**
 * Updates the existing notification in-place for each stage (e.g. จาก "ผู้ซื้อชำระสินค้า" ไป "ลูกค้าได้รับสินค้าแล้ว")
 */
async function notifyOrderStatusChanged(order, status, { reason } = {}) {
  // Seller accept/reject have their own two-sided messages and realtime push.
  if (status === "confirmed" && order?.status === "paid")
    return notifyOrderConfirmed({ ...order, status });
  if (status === "cancelled" && order?.status === "paid")
    return notifyOrderRejected(order, reason);
  broadcastOrderRealtime({ ...order, status }, status).catch(() => {});

  const statusLabel = STATUS_MESSAGE_TH[status];
  if (!statusLabel || !order || !order.id) return;

  const title = order.productTitle || "สินค้า";
  const tasks = [];

  if (order.buyerId) {
    const buyerBody =
      status === "shipped"
        ? `📦 ผู้ขายจัดส่งสินค้าแล้ว | หมายเลขคำสั่งซื้อ: #${order.id}`
        : status === "delivered"
          ? `📬 สินค้าถึงผู้ซื้อแล้ว กรุณากดยืนยันเมื่อได้รับสินค้า (ระบบจะยืนยันให้อัตโนมัติใน 14 วัน) | หมายเลขคำสั่งซื้อ: #${order.id}`
          : status === "completed"
          ? `🎉 คำสั่งซื้อ #${order.id} ('${title}') เสร็จสมบูรณ์แล้ว ขอบคุณที่ใช้บริการ`
          : status === "cancelled"
            ? `⚠️ คำสั่งซื้อ #${order.id} ('${title}') ถูกยกเลิกแล้ว`
            : `คำสั่งซื้อ #${order.id}: ${statusLabel}`;

    tasks.push(
      sendSystemNotification({
        userId: order.buyerId,
        type: "ORDER",
        title:
          status === "shipped"
            ? "ผู้ขายจัดส่งสินค้าแล้ว"
            : status === "delivered"
              ? "สินค้าถึงแล้ว กรุณายืนยันการรับสินค้า"
              : status === "completed"
              ? "คำสั่งซื้อเสร็จสมบูรณ์"
              : status === "cancelled"
                ? "คำสั่งซื้อถูกยกเลิก"
                : `อัปเดตสถานะคำสั่งซื้อ #${order.id}`,
        message: buyerBody,
        link: `/orders?orderId=${order.id}`,
        metadata: {
          orderId: order.id,
          productId: order.productId,
          auctionId: order.auctionId,
          status,
        },
        entityId: order.id,
      }),
    );
  }

  if (order.sellerId && order.sellerId !== order.buyerId) {
    let sellerTitle = null;
    let sellerBody = null;
    let sellerLink = `/seller/dashboard?section=orders&orderId=${order.id}`;

    if (status === "shipped") {
      sellerTitle = "จัดส่งสินค้าแล้ว";
      sellerBody = `🚚 คุณได้จัดส่งสินค้า '${title}' แล้ว รอลูกค้ายืนยันการรับสินค้า | หมายเลขคำสั่งซื้อ: #${order.id}`;
    } else if (status === "completed") {
      sellerTitle = "ลูกค้าได้รับสินค้าแล้ว";
      sellerBody = `🎉 ลูกค้าได้รับสินค้าแล้ว คำสั่งซื้อ #${order.id} ('${title}') เสร็จสมบูรณ์`;
    } else if (status === "cancelled") {
      sellerTitle = "คำสั่งซื้อถูกยกเลิก";
      sellerBody = `⚠️ คำสั่งซื้อ #${order.id} ('${title}') ถูกยกเลิกแล้ว`;
    }

    if (sellerTitle && sellerBody) {
      tasks.push(
        sendSystemNotification({
          userId: order.sellerId,
          type: "ORDER",
          title: sellerTitle,
          message: sellerBody,
          link: sellerLink,
          metadata: {
            orderId: order.id,
            productId: order.productId,
            auctionId: order.auctionId,
            status,
          },
          entityId: order.id,
        }),
      );
    }
  }

  await Promise.all(tasks);
}

/**
 * Notifies the seller in the Notification Center when a dispute is opened.
 * Also opens/notifies in the dispute room for Trust and Safety case handling.
 */
async function notifyDisputeOpened(dispute, order) {
  if (!order || !order.id) return;

  const title = order.productTitle || "สินค้า";

  if (order.buyerId) {
    await sendSystemNotification({
      userId: order.buyerId,
      type: "DISPUTE",
      title: "เปิดข้อพิพาทสำเร็จ",
      message: `⚠️ คำสั่งซื้อ #${order.id} ('${title}') เปิดข้อพิพาทเรียบร้อยแล้ว อยู่ระหว่างการพิจารณาตรวจสอบของเจ้าหน้าที่`,
      link: `/orders?orderId=${order.id}`,
      entityId: order.id,
      metadata: {
        orderId: order.id,
        disputeId: dispute.id,
        productId: order.productId,
        disputeType: dispute.disputeType,
        reason: dispute.reason,
        decision: "DISPUTE_OPENED",
        decisionLabel: "เปิดข้อพิพาทแล้ว",
        role: "buyer",
      },
    });
  }
}

async function broadcastOrderRealtime(order, action = "updated") {
  if (!order || !order.id) return;
  const sellerId = order.sellerId || order.seller?.id;
  const buyerId = order.buyerId || order.buyer?.id;
  const rooms = [];
  if (sellerId) rooms.push(`user:${sellerId}`);
  if (buyerId) rooms.push(`user:${buyerId}`);

  try {
    await internalPost("/internal/realtime/broadcast", {
      event: "order:updated",
      data: { order, action },
      rooms,
      broadcastGlobal: false,
    });

    if (order.productId) {
      const statusMap = {
        completed: "sold",
        paid: "reserved",
        confirmed: "reserved",
        shipped: "sold",
        delivered: "sold",
        cancelled: "available",
      };
      const effectiveStatus = order.status || action;
      const productStatus = statusMap[effectiveStatus];
      if (productStatus) {
        await internalPost("/internal/realtime/broadcast", {
          event: "product:updated",
          data: {
            product: { id: order.productId, status: productStatus },
            action: "status_changed",
          },
          rooms: sellerId ? [`user:${sellerId}`] : [],
          broadcastGlobal: true,
        });
      }
    }
  } catch (err) {
    console.warn("[chatClient] broadcastOrderRealtime warning:", err.message);
  }
}

