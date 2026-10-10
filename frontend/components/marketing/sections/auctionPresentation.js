export const STATUS_LABEL = {
  draft: "ร่าง",
  pending_approval: "รออนุมัติจาก Marketing",
  rejected: "ถูกปฏิเสธ",
  approved: "อนุมัติแล้ว รอกำหนดเวลา",
  scheduled: "ตั้งเวลาแล้ว รอเปิด",
  open: "กำลังประมูล",
  closed: "ปิดประมูลแล้ว",
  cancelled: "ยกเลิกแล้ว",
};

export const STATUS_STYLE = {
  draft: "bg-slate-100 text-slate-600",
  pending_approval: "bg-amber-50 text-amber-700",
  rejected: "bg-red-50 text-red-700",
  approved: "bg-sky-50 text-sky-700",
  scheduled: "bg-sky-50 text-sky-700",
  open: "bg-emerald-50 text-emerald-700",
  closed: "bg-slate-100 text-slate-500",
  cancelled: "bg-slate-100 text-slate-500",
};

export function baht(v, fallback = "—") {
  if (v == null || Number.isNaN(Number(v))) return fallback;
  return `฿${Number(v).toLocaleString("th-TH")}`;
}
