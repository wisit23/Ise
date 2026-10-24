// Bell notifications when staff pick up or escalate a dispute. Verdicts and
// evidence requests already notify from disputeService. Best-effort: a
// chat-service outage must never fail the staff action.
const orderModel = require("../../models/orderModel");
const chatClient = require("../../services/chatClient");
const { isSellerVisible } = require("./sellerVisibility");

const NOTICES = {
  CLAIMED: {
    title: "เจ้าหน้าที่รับเรื่องข้อพิพาทแล้ว",
    message: (order, title) =>
      `🧑‍💼 คำสั่งซื้อ #${order.id} ('${title}'): เจ้าหน้าที่รับเรื่องข้อพิพาทแล้วและกำลังตรวจสอบ`,
  },
  // Customers see "further review", not which internal team holds the case.
  ESCALATED: {
    title: "ข้อพิพาทอยู่ระหว่างตรวจสอบเพิ่มเติม",
    message: (order, title) =>
      `🔎 คำสั่งซื้อ #${order.id} ('${title}'): ข้อพิพาทถูกส่งให้ทีมที่เกี่ยวข้องตรวจสอบเพิ่มเติมแล้ว`,
  },
};

async function notifyDisputeStatus(dispute, event, { orders = orderModel, chat = chatClient } = {}) {
  const notice = NOTICES[event];
  if (!notice || !dispute?.orderId || !chat?.sendSystemNotification) return [];
  try {
    const order = await orders.findById(dispute.orderId);
    if (!order) return [];
    const title = order.productTitle || "สินค้า";
    // Sellers only hear about a dispute once staff have involved them.
    const recipients = [
      order.buyerId && { userId: order.buyerId, role: "buyer" },
      order.sellerId && isSellerVisible(dispute) && { userId: order.sellerId, role: "seller" },
    ].filter(Boolean);
    return await Promise.all(
      recipients.map(({ userId, role }) =>
        chat
          .sendSystemNotification({
            userId,
            type: "DISPUTE",
            title: notice.title,
            message: notice.message(order, title),
            link: `/support/cases/${order.id}`,
            entityId: `dispute:${dispute.id}:${event}:${dispute.version}:${role}`,
            metadata: {
              orderId: order.id,
              disputeId: dispute.id,
              event,
              role,
              statusUpdate: true,
            },
          })
          .catch((err) => {
            console.error(`[disputeStatusNotices] ${event} notice to ${role} failed: ${err.message}`);
            return null;
          }),
      ),
    );
  } catch (err) {
    console.error(`[disputeStatusNotices] ${event} notice for ${dispute.id} failed: ${err.message}`);
    return [];
  }
}

module.exports = { notifyDisputeStatus, NOTICES };
