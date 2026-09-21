export const CHECKOUT_COUPONS = [
  {
    code: "RELOOPNEW",
    title: "ลดทันที ฿50",
    description: "เมื่อยอดรวมตั้งแต่ ฿300",
    minSpend: 300,
    type: "fixed",
    value: 50,
  },
  {
    code: "FREESHIP40",
    title: "ส่วนลดค่าจัดส่ง ฿40",
    description: "เมื่อยอดรวมตั้งแต่ ฿200",
    minSpend: 200,
    type: "fixed",
    value: 40,
  },
  {
    code: "VINTAGE15",
    title: "ลด 15% สูงสุด ฿150",
    description: "เมื่อยอดรวมตั้งแต่ ฿500",
    minSpend: 500,
    type: "percent",
    value: 15,
    max: 150,
  },
];

export function calculateCheckoutDiscount(code, subtotal) {
  if (!code) return 0;
  const coupon = CHECKOUT_COUPONS.find((item) => item.code === code);
  if (!coupon || subtotal < coupon.minSpend) return 0;
  const raw =
    coupon.type === "percent"
      ? Math.floor((subtotal * coupon.value) / 100)
      : coupon.value;
  return Math.min(raw, coupon.max ?? raw, subtotal);
}

export function remainingSeconds(expiresAt, now = Date.now()) {
  if (!expiresAt) return 0;
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000));
}

export function formatCheckoutCountdown(seconds) {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const remaining = String(safe % 60).padStart(2, "0");
  return `${String(minutes).padStart(2, "0")}:${remaining}`;
}
