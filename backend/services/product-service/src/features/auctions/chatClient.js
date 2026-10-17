// Thin service-to-service client toward chat-service's Internal API
// for auction item and round notifications. Best-effort delivery: failures must never
// rollback database transactions or crash auction operations.
const CHAT_SERVICE_URL =
  process.env.CHAT_SERVICE_URL || "http://chat-service:3004";
const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || "";
const MARKETING_SYSTEM_SENDER_ID = "system-marketing";

function auctionItemUrl(itemId) {
  return `/auctions/${encodeURIComponent(itemId)}`;
}

function auctionRoundUrl(roundId) {
  return `/auctions/rounds/${encodeURIComponent(roundId)}`;
}

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

async function deliverAuctionNotification({
  contextId,
  recipientId,
  recipientRole,
  body,
  payload,
  idempotencyKey,
}) {
  const conversation = await internalPost("/internal/conversations", {
    contextType: "AUCTION",
    contextId,
    createdBy: MARKETING_SYSTEM_SENDER_ID,
    participants: [
      { userId: recipientId, role: recipientRole },
      { userId: MARKETING_SYSTEM_SENDER_ID, role: "SYSTEM" },
    ],
  });

  return internalPost(`/internal/conversations/${conversation.id}/messages`, {
    senderId: MARKETING_SYSTEM_SENDER_ID,
    senderRole: "SYSTEM",
    type: "SYSTEM",
    body,
    idempotencyKey,
    payload: {
      ...payload,
      idempotencyKey,
    },
  });
}

async function runNotificationTasks(tasks, logLabel) {
  if (tasks.length === 0) {
    return { deliveredCount: 0, failedCount: 0, warnings: [] };
  }

  const results = await Promise.allSettled(tasks.map((fn) => fn()));
  let deliveredCount = 0;
  let failedCount = 0;

  for (const res of results) {
    if (res.status === "fulfilled") {
      deliveredCount++;
    } else {
      failedCount++;
      console.error(
        `[product-service] chat notification failed for ${logLabel}:`,
        res.reason?.message || res.reason,
      );
    }
  }

  const warnings = [];
  if (failedCount > 0) {
    warnings.push(
      `ไม่สามารถส่งข้อความแจ้งเตือนทางแชทได้ครบทุกฝ่าย (${failedCount} รายการ)`,
    );
  }

  return { deliveredCount, failedCount, warnings };
}

/**
 * Sends SYSTEM notification messages when a single auction item is cancelled.
 * - Always notifies the seller who owns the product.
 * - If cancelled while open (`wasOpen === true`), also notifies buyers who bid on that item.
 * - Non-bidders never receive notifications.
 * - Uses deterministic idempotencyKey (`auction.item_cancelled:<itemId>:<userId>`) so retries never duplicate messages.
 */
async function notifyItemCancelled({
  item,
  round,
  reason,
  wasOpen = false,
  bidderIds = [],
}) {
  if (!item) {
    return { deliveredCount: 0, failedCount: 0, warnings: [] };
  }

  const tasks = [];
  const itemId = item.id;
  const sellerId = item.sellerId;
  const productTitle = item.product?.title || "สินค้า";
  const roundTitle = round?.title || item.round?.title || "รอบประมูล";
  const roundId = round?.id || item.roundId || item.round?.id || null;
  const contextScope = roundId || itemId;
  const cleanReason =
    reason || item.cancellationReason || "ฝ่ายการตลาดยกเลิกรายการประมูล";

  // 1. Seller notification (always)
  if (sellerId) {
    const sellerKey = `auction.item_cancelled:${itemId}:${sellerId}`;
    tasks.push(() =>
      deliverAuctionNotification({
        contextId: `${contextScope}:${sellerId}`,
        recipientId: sellerId,
        recipientRole: "SELLER",
        idempotencyKey: sellerKey,
        body: `รายการประมูลสินค้า "${productTitle}" ในรอบประมูล "${roundTitle}" ถูกยกเลิกเนื่องจาก: ${cleanReason} กรุณาไปที่หน้าจัดการประมูลของผู้ขายเพื่อเลือกส่งสินค้าเข้ารอบประมูลใหม่ หรือกำหนดราคาเพื่อนำกลับไปขายปกติ`,
        payload: {
          event: "auction.item_cancelled",
          summary: `รายการประมูล "${productTitle}" ถูกยกเลิก`,
          auctionId: itemId,
          roundId,
          productId: item.productId,
          productTitle,
          roundTitle,
          reason: cleanReason,
          role: "SELLER",
          actionUrl: auctionItemUrl(itemId),
          actionLabel: "ดูรายละเอียดรายการ",
        },
      }),
    );
  }

  // 2. Bidder notifications (only if item was cancelled during active 'open' auction)
  if (wasOpen) {
    const rawBidders =
      Array.isArray(bidderIds) && bidderIds.length > 0
        ? bidderIds
        : (item.bids || []).map((b) => b.bidderId);
    const uniqueBidders = [
      ...new Set(rawBidders.filter((id) => id && id !== sellerId)),
    ];

    for (const bidderId of uniqueBidders) {
      const bidderKey = `auction.item_cancelled:${itemId}:${bidderId}`;
      tasks.push(() =>
        deliverAuctionNotification({
          contextId: `${contextScope}:${bidderId}`,
          recipientId: bidderId,
          recipientRole: "BUYER",
          idempotencyKey: bidderKey,
          body: `รายการประมูลสินค้า "${productTitle}" ในรอบประมูล "${roundTitle}" ที่คุณเข้าร่วมประมูลถูกยกเลิกเนื่องจาก: ${cleanReason} การเสนอราคาของคุณในรายการนี้ถูกยกเลิกและไม่มีการเรียกเก็บค่าใช้จ่ายใดๆ`,
          payload: {
            event: "auction.item_cancelled",
            summary: `รายการประมูล "${productTitle}" ถูกยกเลิก`,
            auctionId: itemId,
            roundId,
            productId: item.productId,
            productTitle,
            roundTitle,
            reason: cleanReason,
            role: "BUYER",
            actionUrl: auctionItemUrl(itemId),
            actionLabel: "ดูรายละเอียดรายการ",
          },
        }),
      );
    }
  }

  return runNotificationTasks(tasks, `item ${itemId}`);
}

/** Sends the required rejection reason to the product owner. */
async function notifyItemRejected({ item, round, reason }) {
  if (!item?.sellerId) {
    return { deliveredCount: 0, failedCount: 0, warnings: [] };
  }

  const productTitle = item.product?.title || "สินค้า";
  const roundTitle = round?.title || item.round?.title || "รอบประมูล";
  const cleanReason =
    reason || item.cancellationReason || "ฝ่ายการตลาดปฏิเสธรายการประมูล";

  return runNotificationTasks(
    [
      () =>
        deliverAuctionNotification({
          contextId: `${item.roundId || round?.id || item.id}:${item.sellerId}`,
          recipientId: item.sellerId,
          recipientRole: "SELLER",
          idempotencyKey: `auction.item_rejected:${item.id}:${item.sellerId}`,
          body: `รายการประมูลสินค้า "${productTitle}" ในรอบประมูล "${roundTitle}" ถูกปฏิเสธเนื่องจาก: ${cleanReason}`,
          payload: {
            event: "auction.item_rejected",
            summary: `รายการประมูล "${productTitle}" ถูกปฏิเสธ`,
            auctionId: item.id,
            roundId: item.roundId || round?.id || null,
            productId: item.productId,
            productTitle,
            roundTitle,
            reason: cleanReason,
            role: "SELLER",
            actionUrl: auctionItemUrl(item.id),
            actionLabel: "ดูรายละเอียดรายการ",
          },
        }),
    ],
    `rejected item ${item.id}`,
  );
}

/**
 * Sends SYSTEM notification messages to affected sellers and bidders when an auction round is cancelled.
 * - Deduplicates per recipient.
 * - Uses dedicated 1-on-1 AUCTION context per user (AUCTION:roundId:userId) to avoid leaking participants.
 * - Uses deterministic idempotencyKey (`auction.round_cancelled:<roundId>:<userId>`) so retries never duplicate messages.
 * - Uses Promise.allSettled so partial or total failures never throw, and returns warnings for Marketing UI.
 */
async function notifyRoundCancelled({ round, sellerIds = [], bidderIds = [] }) {
  if (!round) {
    return { deliveredCount: 0, failedCount: 0, warnings: [] };
  }

  const tasks = [];
  const uniqueSellers = [...new Set(sellerIds.filter(Boolean))];
  const uniqueBidders = [...new Set(bidderIds.filter(Boolean))];
  const cleanReason =
    round.cancellationReason || "ฝ่ายการตลาดยกเลิกรอบการประมูล";

  // 1. Sellers
  for (const sellerId of uniqueSellers) {
    const sellerKey = `auction.round_cancelled:${round.id}:${sellerId}`;
    tasks.push(() =>
      deliverAuctionNotification({
        contextId: `${round.id}:${sellerId}`,
        recipientId: sellerId,
        recipientRole: "SELLER",
        idempotencyKey: sellerKey,
        body: `รอบประมูล "${round.title}" ถูกยกเลิกเนื่องจาก: ${cleanReason} ส่งผลให้รายการสินค้าของคุณในรอบนี้ถูกยกเลิก กรุณาไปที่หน้าจัดการประมูลของผู้ขายเพื่อเลือกส่งสินค้าเข้ารอบประมูลใหม่ หรือกำหนดราคาเพื่อนำกลับไปขายปกติ`,
        payload: {
          event: "auction.round_cancelled",
          summary: `รอบประมูล "${round.title}" ถูกยกเลิก`,
          roundId: round.id,
          roundTitle: round.title,
          reason: cleanReason,
          role: "SELLER",
          actionUrl: auctionRoundUrl(round.id),
          actionLabel: "ดูรายละเอียดรอบประมูล",
        },
      }),
    );
  }

  // 2. Bidders (if active auction at cancellation time)
  for (const bidderId of uniqueBidders) {
    if (uniqueSellers.includes(bidderId)) continue;
    const bidderKey = `auction.round_cancelled:${round.id}:${bidderId}`;
    tasks.push(() =>
      deliverAuctionNotification({
        contextId: `${round.id}:${bidderId}`,
        recipientId: bidderId,
        recipientRole: "BUYER",
        idempotencyKey: bidderKey,
        body: `รอบประมูล "${round.title}" ที่คุณเข้าร่วมประมูลถูกยกเลิกเนื่องจาก: ${cleanReason} ส่งผลให้การเสนอราคาทั้งหมดในรอบนี้ถูกยกเลิกและไม่มีการเรียกเก็บค่าใช้จ่ายใดๆ`,
        payload: {
          event: "auction.round_cancelled",
          summary: `รอบประมูล "${round.title}" ถูกยกเลิก`,
          roundId: round.id,
          roundTitle: round.title,
          reason: cleanReason,
          role: "BUYER",
          actionUrl: auctionRoundUrl(round.id),
          actionLabel: "ดูรายละเอียดรอบประมูล",
        },
      }),
    );
  }

  return runNotificationTasks(tasks, `round ${round.id}`);
}

async function sendSystemNotification({ userId, type, title, message, link, metadata, entityId }) {
  try {
    return await internalPost("/internal/notifications", {
      userId,
      type,
      title,
      message,
      link,
      metadata,
      entityId,
    });
  } catch (err) {
    console.error(`[product-service] notification failed: ${err.message}`);
  }
}

/**
 * Sends a notification message to the seller when a buyer places a bid on their auction item.
 * Delivers directly to the Notification Center without polluting the buyer-seller chat.
 */
async function notifyBidPlaced({ auction, bid, bidder }) {
  if (!auction || !bid || !auction.sellerId) {
    return { deliveredCount: 0, failedCount: 0, warnings: [] };
  }

  const tasks = [];
  const productTitle = auction.product?.title || "สินค้าประมูล";
  const bidAmount = bid.amount;
  const bidderName =
    bidder?.firstName ||
    (bid.bidderId ? `ผู้ใช้ ${bid.bidderId.slice(-6)}` : "ผู้ซื้อ");

  tasks.push(async () => {
    return internalPost("/internal/notifications", {
      userId: auction.sellerId,
      type: "AUCTION",
      title: "มีการเสนอราคาประมูลใหม่",
      message: `🔨 มีการเสนอราคาประมูลสินค้า "${productTitle}" ล่าสุดที่ ฿${bidAmount.toLocaleString("th-TH")} (โดย ${bidderName})`,
      link: `/auctions/${auction.id}`,
      metadata: {
        auctionId: auction.id,
        productId: auction.productId,
        productTitle,
        amount: bidAmount,
        bidderId: bid.bidderId,
        bidderName,
      },
      entityId: auction.id,
    });
  });

  return runNotificationTasks(tasks, `bid ${bid.id}`);
}

/**
 * Sends a platform-wide notification when an auction round opens.
 */
async function notifyRoundOpened(round) {
  if (!round) return;
  return sendSystemNotification({
    userId: "ALL",
    type: "AUCTION",
    title: "เปิดรอบการประมูลใหม่",
    message: `🔨 รอบประมูล "${round.title}" เปิดให้เสนอราคาแล้ว เข้าร่วมประมูลสินค้าเลย!`,
    link: "/auctions",
    metadata: { roundId: round.id, roundTitle: round.title },
  });
}

async function notifyRoundUpdated({ round, metadata, eventId }) {
  const labels = {
    submissionStartsAt: "เริ่มรับสินค้า", submissionEndsAt: "ปิดรับสินค้า",
    auctionStartsAt: "เริ่มประมูล", auctionEndsAt: "ปิดประมูล",
  };
  const formatTime = value => new Date(value).toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short",
  });
  const changes = metadata.changedFields.map(field =>
    `${labels[field]}: ${formatTime(metadata.previousTimes[field])} → ${formatTime(round[field])}`,
  ).join("\n");
  const recipients = new Map(metadata.sellerIds.map(id => [id, "SELLER"]));
  for (const item of metadata.affectedItems) {
    for (const id of item.bidderIds) if (!recipients.has(id)) recipients.set(id, "BUYER");
  }
  const tasks = [...recipients].map(([id, role]) => () => {
    const relevantItems = metadata.affectedItems.filter(item =>
      item.sellerId === id || item.bidderIds.includes(id));
    const itemTimes = relevantItems.map(item => `${item.title}: ปิด ${formatTime(item.closesAt)}`).join("\n");
    return deliverAuctionNotification({ contextId: `${round.id}:${id}`, recipientId: id,
      recipientRole: role, idempotencyKey: `${eventId}:${id}`,
      body: `ฝ่ายการตลาดแก้ไขเวลารอบประมูล "${round.title}"\n${changes}${itemTimes ? `\nเวลาปิดจริงของสินค้าที่เกี่ยวข้อง:\n${itemTimes}` : ""}\nเวลาที่ต่อจากการเสนอราคายังคงได้รับการรักษาไว้`,
      payload: {
        event: "auction.round_updated",
        summary: `เวลารอบประมูล "${round.title}" มีการเปลี่ยนแปลง`,
        roundId: round.id,
        roundTitle: round.title,
        eventId,
        role,
        actionUrl: auctionRoundUrl(round.id),
        actionLabel: "ดูรายละเอียดรอบประมูล",
      },
    });
  });
  return runNotificationTasks(tasks, `update round ${round.id}`);
}

module.exports = {
  notifyRoundUpdated,
  MARKETING_SYSTEM_SENDER_ID,
  notifyItemRejected,
  notifyItemCancelled,
  notifyRoundCancelled,
  notifyBidPlaced,
  notifyRoundOpened,
  sendSystemNotification,
};
