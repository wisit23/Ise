// Mirrors order-service's orderLifecycle rules so the UI only offers buttons
// the API will accept.
const DAY_MS = 24 * 60 * 60 * 1000;
export const DISPUTE_WINDOW_DAYS = 14;
export const AUTO_COMPLETE_DAYS = 14;

/** Buyer cancellation stops when the seller confirms the order. */
export function canBuyerCancel(order) {
  return Boolean(order) &&
    ["pending_payment", "paid"].includes(order.status) &&
    !order.dispute && !order.payoutHeld && order.paymentSimulationStatus !== "ON_HOLD";
}

/** Seller action that moves an order to its next step, if any. */
export const SELLER_NEXT_STEP = {
  paid: { status: "confirmed", label: "ยอมรับคำสั่งซื้อ" },
  confirmed: { status: "ready_to_ship", label: "เตรียมสินค้าเรียบร้อย" },
  ready_to_ship: { status: "pickup_in_progress", label: "เรียกขนส่ง" },
  pickup_in_progress: { status: "in_transit", label: "ส่งมอบให้ขนส่งแล้ว" },
};

function receivedAt(order) {
  const value = order?.deliveredAt || order?.completedAt;
  return value ? new Date(value) : null;
}

export function disputeDeadline(order) {
  const at = receivedAt(order);
  return at ? new Date(at.getTime() + DISPUTE_WINDOW_DAYS * DAY_MS) : null;
}

export function canOpenDispute(order, now = new Date()) {
  if (!order || order.dispute) return false;
  if (!["delivered", "completed"].includes(order.status)) return false;
  const deadline = disputeDeadline(order);
  return Boolean(deadline) && now < deadline;
}

/** When a delivered order will close itself if the buyer does nothing. */
export function autoCompleteAt(order) {
  if (order?.status !== "delivered" || !order.deliveredAt) return null;
  return new Date(
    new Date(order.deliveredAt).getTime() + AUTO_COMPLETE_DAYS * DAY_MS,
  );
}
