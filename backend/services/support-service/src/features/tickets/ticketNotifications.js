// Bell notifications to the customer when staff move their ticket along.
// Best-effort: a chat-service outage must never fail the status change.
const chatClient = require("../../services/chatClient");

// Escalation is worded as "under further review": customers don't need to
// know which internal team holds the case.
const NOTICES = {
  ASSIGNED: {
    title: "เจ้าหน้าที่รับเรื่องของคุณแล้ว",
    message: (t) => `เจ้าหน้าที่รับเรื่อง ${t} แล้ว และจะติดต่อกลับโดยเร็ว`,
  },
  IN_PROGRESS: {
    title: "เจ้าหน้าที่กำลังดำเนินการ",
    message: (t) => `เรื่อง ${t} อยู่ระหว่างการดำเนินการ`,
  },
  REOPENED: {
    title: "เรื่องของคุณถูกเปิดใหม่",
    message: (t) => `เจ้าหน้าที่เปิดเรื่อง ${t} ใหม่อีกครั้งเพื่อตรวจสอบต่อ`,
  },
  PENDING_USER: {
    title: "เจ้าหน้าที่รอข้อมูลจากคุณ",
    message: (t) => `กรุณาตอบกลับในแชทของเรื่อง ${t} เพื่อให้ดำเนินการต่อได้`,
  },
  ESCALATED: {
    title: "เรื่องของคุณอยู่ระหว่างตรวจสอบเพิ่มเติม",
    message: (t) => `เรื่อง ${t} ถูกส่งให้ทีมที่เกี่ยวข้องตรวจสอบเพิ่มเติมแล้ว`,
  },
  RESOLVED: {
    title: "เจ้าหน้าที่แก้ไขเรื่องของคุณแล้ว",
    message: (t) => `เรื่อง ${t} ได้รับการแก้ไขแล้ว หากยังพบปัญหาสามารถแจ้งกลับในแชทได้`,
  },
  CLOSED: {
    title: "ปิดเรื่องของคุณแล้ว",
    message: (t) => `เรื่อง ${t} ถูกปิดแล้ว ขอบคุณที่ติดต่อเรา`,
  },
};

function noticeKey(status, previousStatus) {
  if (status === "IN_PROGRESS" && previousStatus === "RESOLVED") return "REOPENED";
  return NOTICES[status] ? status : null;
}

function ticketLabel(ticket) {
  const number = ticket.ticketNumber ? `#${ticket.ticketNumber}` : "";
  return ticket.subject ? `${number} "${ticket.subject}"`.trim() : number || "ของคุณ";
}

async function notifyTicketStatus(ticket, status, previousStatus) {
  const key = noticeKey(status, previousStatus);
  if (!key || !ticket?.requesterId) return null;
  const notice = NOTICES[key];
  try {
    return await chatClient.sendNotification({
      userId: ticket.requesterId,
      type: "SUPPORT",
      title: notice.title,
      message: notice.message(ticketLabel(ticket)),
      link: `/support/tickets/${ticket.id}`,
      entityId: ticket.id,
      metadata: { ticketId: ticket.id, status, previousStatus: previousStatus ?? null },
    });
  } catch (err) {
    console.error(`[ticketNotifications] ${status} notice for ${ticket.id} failed: ${err.message}`);
    return null;
  }
}

module.exports = { notifyTicketStatus, noticeKey, NOTICES };
