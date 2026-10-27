const { badRequest, conflict, forbidden } = require("@reloop/shared");

const DAY_MS = 24 * 60 * 60 * 1000;

// Timing rules are env-configurable so local demos and tests need not wait.
function durationMs(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}
const timing = {
  // No real carrier: delivery delay starts only after carrier handoff.
  deliveryDelayMs: () => durationMs("ORDER_DELIVERY_DELAY_MS", 10 * 1000),
  autoCompleteMs: () => durationMs("ORDER_AUTO_COMPLETE_MS", 14 * DAY_MS),
  sellerConfirmTimeoutMs: () =>
    durationMs("ORDER_SELLER_CONFIRM_TIMEOUT_MS", DAY_MS),
  disputeWindowMs: () => durationMs("ORDER_DISPUTE_WINDOW_MS", 14 * DAY_MS),
};

/**
 * Status a buyer or seller may request through PATCH /orders/:id/status, and
 * the statuses each role may move it from. Everything else (paid, delivered,
 * timeouts, disputed, refunded) is set by the system.
 */
const PARTICIPANT_TRANSITIONS = {
  confirmed: { seller: ["paid"] },
  // Older ready_to_ship orders can continue, but new orders skip that step.
  pickup_in_progress: { seller: ["confirmed", "ready_to_ship"] },
  in_transit: { seller: ["pickup_in_progress"] },
  completed: { buyer: ["delivered"] },
  cancelled: {
    buyer: ["pending_payment", "paid"],
    seller: ["pending_payment", "paid", "confirmed", "ready_to_ship"],
  },
};
const USER_SETTABLE_STATUSES = Object.keys(PARTICIPANT_TRANSITIONS);

function participantRole(order, userId) {
  if (order.sellerId === userId) return "seller";
  if (order.buyerId === userId) return "buyer";
  return null;
}

function assertParticipantTransition(order, userId, status) {
  const rule = PARTICIPANT_TRANSITIONS[status];
  if (!rule)
    throw badRequest(
      `status must be one of ${USER_SETTABLE_STATUSES.join(", ")}`,
    );
  const role = participantRole(order, userId);
  if (!role) throw forbidden("you are not part of this order");
  const allowedFrom = rule[role];
  if (!allowedFrom) throw forbidden(`only the ${role === "buyer" ? "seller" : "buyer"} can set this order to ${status}`);
  if (!allowedFrom.includes(order.status))
    throw conflict(`cannot change order from ${order.status} to ${status}`);
  return role;
}

/** Cancellations before dispatch and seller-confirmation expiry can refund the buyer. */
function isRefundingCancellation(order, status) {
  return (
    (status === "cancelled" &&
      ["paid", "confirmed", "ready_to_ship"].includes(order.status)) ||
    (status === "seller_confirmation_expired" && order.status === "paid")
  );
}

/** Buyers may dispute a received order until the window after delivery closes. */
function disputeWindowEndsAt(order) {
  const receivedAt = order.deliveredAt || order.completedAt;
  if (!receivedAt) return null;
  return new Date(new Date(receivedAt).getTime() + timing.disputeWindowMs());
}

function isWithinDisputeWindow(order, now = new Date()) {
  const endsAt = disputeWindowEndsAt(order);
  return Boolean(endsAt) && now < endsAt;
}

module.exports = {
  timing,
  PARTICIPANT_TRANSITIONS,
  USER_SETTABLE_STATUSES,
  participantRole,
  assertParticipantTransition,
  isRefundingCancellation,
  disputeWindowEndsAt,
  isWithinDisputeWindow,
};
