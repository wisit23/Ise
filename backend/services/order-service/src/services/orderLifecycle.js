const { badRequest, conflict, forbidden } = require("@reloop/shared");

const DAY_MS = 24 * 60 * 60 * 1000;

// Timing rules are env-configurable so local demos and tests need not wait.
function durationMs(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}
const timing = {
  // No real carrier: a shipped order is treated as delivered after this delay.
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
  ready_to_ship: { seller: ["confirmed"] },
  shipped: { seller: ["ready_to_ship"] },
  completed: { buyer: ["delivered"] },
  cancelled: {
    buyer: ["pending", "pending_payment"],
    seller: ["pending", "pending_payment", "paid", "confirmed", "ready_to_ship"],
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

/** Seller cancellation before dispatch refunds the buyer, including after acceptance. */
function isRefundingCancellation(order, status) {
  return status === "cancelled" && ["paid", "confirmed", "ready_to_ship"].includes(order.status);
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
