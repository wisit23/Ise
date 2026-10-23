/* Status vocabulary shared by the dashboard's order list and product list. */

export const PRODUCT_STATUS_LABEL = {
  available: "พร้อมขาย",
  reserved: "อยู่ในตะกร้าลูกค้า",
  sold: "ขายแล้ว",
  auction: "กำลังประมูล",
  auction_action_required: "รอเลือกขายปกติหรือประมูลใหม่",
  hidden: "ซ่อนอยู่",
  removed: "ถูกระงับโดย Trust & Safety",
};

export const PRODUCT_STATUS_STYLE = {
  available: "bg-emerald-50 text-emerald-700",
  reserved: "bg-amber-50 text-amber-700",
  sold: "bg-gray-100 text-gray-600",
  auction: "bg-sky-50 text-sky-700",
  auction_action_required: "bg-amber-50 text-amber-800",
  hidden: "bg-yellow-50 text-yellow-800",
  removed: "bg-red-50 text-red-700",
};

export const ORDER_STATUS_LABEL = {
  pending: "รอลูกค้าชำระเงิน",
  pending_payment: "รอลูกค้าชำระเงิน",
  paid: "รอยืนยันคำสั่งซื้อ",
  confirmed: "ต้องเตรียมสินค้า",
  ready_to_ship: "รอขนส่งมารับ",
  shipped: "อยู่ระหว่างการขนส่ง",
  delivered: "ส่งถึงผู้ซื้อแล้ว",
  completed: "ขายสำเร็จ",
  cancelled: "ยกเลิกแล้ว",
  disputed: "อยู่ระหว่างข้อพิพาท",
  refunded: "คืนเงินแล้ว",
};

export const ORDER_STATUS_STYLE = {
  pending: "bg-amber-50 text-amber-700",
  pending_payment: "bg-amber-50 text-amber-700",
  paid: "bg-indigo-50 text-indigo-700 font-semibold border border-indigo-200",
  confirmed: "bg-sky-50 text-sky-700",
  ready_to_ship: "bg-sky-50 text-sky-700",
  shipped: "bg-sky-50 text-sky-700",
  delivered: "bg-violet-50 text-violet-700",
  completed: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-gray-100 text-gray-600",
  disputed: "bg-red-50 text-red-700",
  refunded: "bg-purple-50 text-purple-700",
};

export function baht(v) {
  return `฿${v.toLocaleString("th-TH")}`;
}

export function sellerProductPrice(product) {
  if (product.auctionStatus === "closed" && Number.isFinite(product.auctionWinningPrice)) {
    return { amount: product.auctionWinningPrice, label: "ราคาที่ชนะประมูล" };
  }
  if (product.auctionStatus === "open" && Number.isFinite(product.auctionCurrentBid)) {
    return { amount: product.auctionCurrentBid, label: "ราคาบิดสูงสุด" };
  }
  if (product.status === "auction") {
    return { amount: product.auctionStartingPrice ?? product.price, label: "ราคาเริ่มต้น" };
  }
  return { amount: product.price, label: null };
}

/**
 * Checks whether an order is currently in an active, unresolved dispute.
 * Returns false once the dispute has been decided or resolved.
 */
export function isOrderDisputed(order) {
  if (!order) return false;
  if (order.dispute) {
    if (!isSellerDisputeVisible(order.dispute)) return false;
    if (order.dispute.decision) return false;
    if (["DECIDED", "RESOLVED", "CLOSED"].includes(order.dispute.status)) return false;
    return true;
  }
  return false;
}

export function isSellerDisputeVisible(dispute) {
  return Boolean(dispute && !dispute.deletedAt && (
    dispute.sellerVisible || dispute.decision ||
    ["NEEDS_INFO", "DECIDED", "RESOLVED", "CLOSED"].includes(dispute.status)
  ));
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

