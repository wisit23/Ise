/* Status vocabulary shared by the dashboard's order list and product list. */

export const PRODUCT_STATUS_LABEL = {
  available: "พร้อมขาย",
  reserved: "อยู่ในตะกร้าลูกค้า",
  sold: "ขายแล้ว",
};

export const PRODUCT_STATUS_STYLE = {
  available: "bg-emerald-50 text-emerald-700",
  reserved: "bg-amber-50 text-amber-700",
  sold: "bg-gray-100 text-gray-600",
};

export const ORDER_STATUS_LABEL = {
  pending: "รอลูกค้าชำระเงิน",
  pending_payment: "รอลูกค้าชำระเงิน",
  confirmed: "ยืนยันแล้ว",
  shipped: "จัดส่งแล้ว",
  completed: "ขายสำเร็จ",
  cancelled: "ยกเลิกแล้ว",
};

export const ORDER_STATUS_STYLE = {
  pending: "bg-amber-50 text-amber-700",
  pending_payment: "bg-amber-50 text-amber-700",
  confirmed: "bg-sky-50 text-sky-700",
  shipped: "bg-sky-50 text-sky-700",
  completed: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-gray-100 text-gray-600",
};

export function baht(v) {
  return `฿${v.toLocaleString("th-TH")}`;
}

export function StatusPill({ label, style }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${
        style || "bg-gray-100 text-gray-600"
      }`}
    >
      {label}
    </span>
  );
}
