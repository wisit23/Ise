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

// Agent-only next steps offered from each status (see ticketState.js).
export const AGENT_NEXT_STATUS = {
  NEW: ["ESCALATED", "CLOSED"],
  ASSIGNED: ["IN_PROGRESS", "ESCALATED", "CLOSED"],
  IN_PROGRESS: ["PENDING_USER", "RESOLVED", "ESCALATED"],
  PENDING_USER: ["IN_PROGRESS", "RESOLVED", "CLOSED"],
  RESOLVED: ["CLOSED", "IN_PROGRESS"],
  ESCALATED: ["IN_PROGRESS", "RESOLVED", "CLOSED"],
  CLOSED: [],
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
  pending: "รอชำระเงิน",
  confirmed: "ยืนยันแล้ว",
  shipped: "จัดส่งแล้ว",
  completed: "สำเร็จ",
  cancelled: "ยกเลิก",
  disputed: "อยู่ระหว่างพิพาท",
  refunded: "คืนเงินแล้ว",
};

export const HELP_CATEGORIES = [
  { value: "ORDER", label: "คำสั่งซื้อ" },
  { value: "PAYMENT", label: "การชำระเงิน" },
  { value: "ACCOUNT", label: "บัญชีผู้ใช้" },
  { value: "TECHNICAL", label: "ปัญหาการใช้งาน" },
  { value: "OTHER", label: "อื่นๆ" },
];

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

export const PAGE_SIZE = 15;
