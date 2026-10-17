// Thin service-to-service client toward order-service, mirroring the pattern
// in order-service/src/services/productClient.js.
const { AppError } = require("@reloop/shared");

const ORDER_SERVICE_URL =
  process.env.ORDER_SERVICE_URL || "http://order-service:3003";
const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || "";

async function getOrder(orderId) {
  let res;
  try {
    res = await fetch(`${ORDER_SERVICE_URL}/${orderId}/internal`, {
      headers: { "x-internal-token": INTERNAL_TOKEN },
    });
  } catch {
    throw new AppError(502, "order-service is unreachable");
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new AppError(502, "order-service returned an error");
  return res.json();
}

async function getOrderByProductId(productId) {
  if (!productId) return null;
  let res;
  try {
    res = await fetch(
      `${ORDER_SERVICE_URL}/internal/by-product/${encodeURIComponent(productId)}`,
      {
        headers: { "x-internal-token": INTERNAL_TOKEN },
        signal: AbortSignal.timeout(2000),
      },
    );
  } catch {
    return null;
  }
  if (!res || !res.ok) return null;
  return res.json().catch(() => null);
}

module.exports = { getOrder, getOrderByProductId };
