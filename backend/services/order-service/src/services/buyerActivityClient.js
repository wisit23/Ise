// Best-effort client for auth-service's centralized buyer audit stream.
// Logging must never turn a successful checkout into a failed purchase, while
// requestId makes retries idempotent when the same order event is sent again.
const AUTH_SERVICE_URL =
  process.env.AUTH_SERVICE_URL || "http://auth-service:3001";
const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || "";

async function recordBuyerActivity({
  buyerId,
  action,
  targetType = "order",
  targetId,
  metadata,
  requestId,
  occurredAt,
}) {
  try {
    const response = await fetch(
      `${AUTH_SERVICE_URL}/internal/buyer-activity`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-token": INTERNAL_TOKEN,
        },
        signal: AbortSignal.timeout(1000),
        body: JSON.stringify({
          buyerId,
          action,
          source: "ORDER_SERVICE",
          targetType,
          targetId,
          metadata,
          requestId,
          occurredAt,
        }),
      },
    );
    if (!response.ok) {
      console.warn(
        `[buyerActivityClient] auth-service returned ${response.status} for ${action} ${targetId}`,
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn(
      `[buyerActivityClient] failed to record ${action} ${targetId}:`,
      error.message,
    );
    return false;
  }
}

function recordOrderActivity(order, action, metadata = {}) {
  return recordBuyerActivity({
    buyerId: order.buyerId,
    action,
    targetId: order.id,
    requestId: `order:${order.id}:${action.toLowerCase()}`,
    occurredAt: new Date().toISOString(),
    metadata: {
      productId: order.productId,
      sellerId: order.sellerId,
      price: order.price,
      ...metadata,
    },
  });
}

module.exports = { recordBuyerActivity, recordOrderActivity };
