import config from "./customerServiceConfig";
export const TICKET_STATUS_LABEL = {
  NEW: "ตั๋วใหม่",
  ASSIGNED: "มอบหมายแล้ว",
  IN_PROGRESS: "กำลังดำเนินการ",
  PENDING_USER: "รอลูกค้าตอบกลับ",
  RESOLVED: "แก้ไขสำเร็จ",
  CLOSED: "ปิดตั๋วแล้ว",
  ESCALATED: "ส่งเรื่องต่อ",
};

export const TICKET_STATUS_STYLE = {
  NEW: "border border-emerald-400 text-emerald-700 bg-emerald-50",
  ASSIGNED: "border border-sky-400 text-sky-700 bg-sky-50",
  IN_PROGRESS: "border border-blue-400 text-blue-700 bg-blue-50",
  PENDING_USER: "border border-amber-400 text-amber-700 bg-amber-50",
  RESOLVED: "border border-green-400 text-green-700 bg-green-50",
  CLOSED: "border border-gray-300 text-gray-500 bg-gray-50",
  ESCALATED: "border border-red-400 text-red-700 bg-red-50",
};

export const PRIORITY_LABEL = {
  LOW: "ต่ำ",
  NORMAL: "ปานกลาง",
  HIGH: "สูง",
  URGENT: "ด่วนที่สุด",
};

export const PRIORITY_STYLE = {
  LOW: "border border-green-400 text-green-700 bg-green-50",
  NORMAL: "border border-amber-400 text-amber-700 bg-amber-50",
  HIGH: "border border-red-400 text-red-700 bg-red-50",
  URGENT: "bg-red-600 text-white border border-red-600",
};

export const DISPUTE_STATUS_LABEL = {
  OPEN: "รอตรวจสอบ",
  NEEDS_INFO: "รอข้อมูล",
  DECIDED: "ตัดสินแล้ว",
};

export const DISPUTE_STATUS_STYLE = {
  OPEN: "border border-amber-400 text-amber-700 bg-amber-50",
  NEEDS_INFO: "border border-orange-400 text-orange-700 bg-orange-50",
  DECIDED: "border border-green-400 text-green-700 bg-green-50",
};

export const ORDER_STATUS_LABEL = {
  pending_payment: "รอชำระเงิน",
  paid: "ชำระแล้ว รอผู้ขายยืนยัน",
  confirmed: "ยืนยันแล้ว",
  ready_to_ship: "พร้อมเรียกขนส่ง",
  pickup_in_progress: "ขนส่งกำลังเข้ารับสินค้า",
  in_transit: "อยู่ระหว่างการขนส่ง",
  delivered: "ส่งถึงแล้ว",
  completed: "สำเร็จ",
  cancelled: "ยกเลิก",
  payment_expired: "หมดเวลาชำระเงิน",
  seller_confirmation_expired: "หมดเวลายืนยันคำสั่งซื้อ (คืนเงินแล้ว)",
  disputed: "อยู่ระหว่างพิพาท",
  refunded: "คืนเงินแล้ว",
};

export const REPORT_STATUS_LABEL = { OPEN: "รายงานใหม่", REVIEWED: "กำลังตรวจสอบ", ACTIONED: "จัดการแล้ว", DISMISSED: "ยกเลิกแล้ว" };
export const SAFETY_ACTION_LABEL = {
  SUSPEND_USER: "ระงับบัญชี", WARN_USER: "ตักเตือน", DISMISS: "ยกเลิกรายงาน", REMOVE_PRODUCT: "ระงับสินค้า", REMOVE_REVIEW: "ลบรีวิว", RESTORE_PRODUCT: "คืนสถานะสินค้า",
  RESTRICT_BUYER: "เพิกถอนสิทธิ์ซื้อ", RESTRICT_SELLER: "เพิกถอนสิทธิ์ขาย",
  USER_SUSPENDED: "ระงับบัญชี", USER_WARNED: "ตักเตือน", USER_RESTORED: "ปลดระงับบัญชี",
  COMMERCE_RESTRICTED_BUYER: "เพิกถอนสิทธิ์ซื้อ", COMMERCE_RESTRICTED_SELLER: "เพิกถอนสิทธิ์ขาย", COMMERCE_RESTRICTED_ALL: "เพิกถอนสิทธิ์ซื้อขาย", COMMERCE_RESTRICTION_REVOKED: "คืนสิทธิ์ซื้อขาย",
};
export function safetyActionLabel(action) {
  return SAFETY_ACTION_LABEL[action] || SAFETY_ACTION_LABEL[action?.replace(/^REPORT_/, "")] || action;
}

// UI Bakery emerald palette
export const DONUT_PRIORITY_COLORS = {
  LOW: "#80c4be",
  NORMAL: "#f0c040",
  HIGH: "#e8846a",
  URGENT: "#e34948",
};

export const DONUT_DISPUTE_COLORS = {
  OPEN: "#f0c040",
  NEEDS_INFO: "#eb6834",
  DECIDED: "#1baf7a",
};

export const PAGE_SIZE = config.pagination.articles;
export const STAFF_ROLE_LABEL = {
  CUSTOMER_SERVICE: "Customer Service",
  TRUST_AND_SAFETY: "Trust and Safety",
  ADMIN: "Trust and Safety",
};
