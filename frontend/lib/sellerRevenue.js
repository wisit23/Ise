export const PLATFORM_FEE_RATE = 0.03;

// The platform fee is settled for each completed order in whole baht.
export function netRevenueForOrder(order) {
  const gross = order.finalPrice ?? order.price ?? 0;
  return Math.round(gross * (1 - PLATFORM_FEE_RATE));
}
