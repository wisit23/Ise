// WF-10 step 3: "เคสตามเงินหรือเคสข้อพิพาทซื้อขาย = ระดับ Urgent" — pure and
// deterministic so it's testable without touching the database.
const SLA_TARGET_MS = {
  URGENT: 60 * 60 * 1000, // 1 hour
  HIGH: 4 * 60 * 60 * 1000, // 4 hours
  NORMAL: 24 * 60 * 60 * 1000, // 24 hours
  LOW: 72 * 60 * 60 * 1000, // 72 hours
};

const HIGH_VALUE_THRESHOLD = 10000; // baht — matches CSS-003's dispute cases

function calculatePriority({
  isDispute = false,
  category,
  orderAmount = 0,
  minutesWaiting = 0,
} = {}) {
  if (
    isDispute ||
    category === "PAYMENT" ||
    orderAmount >= HIGH_VALUE_THRESHOLD
  ) {
    return "URGENT";
  }
  if (minutesWaiting >= 240) return "HIGH";
  return "NORMAL";
}

function calculateSlaDueAt(priority, from = new Date()) {
  const targetMs = SLA_TARGET_MS[priority] ?? SLA_TARGET_MS.NORMAL;
  return new Date(from.getTime() + targetMs);
}

module.exports = { calculatePriority, calculateSlaDueAt, SLA_TARGET_MS };
