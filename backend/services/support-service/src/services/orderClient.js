const ORDER_SERVICE_URL =
  process.env.ORDER_SERVICE_URL || "http://order-service:3003";
const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || "";

async function getOrder(orderId) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3_000);
  try {
    const res = await fetch(
      `${ORDER_SERVICE_URL}/${encodeURIComponent(orderId)}/internal`,
      {
        headers: { "x-internal-token": INTERNAL_TOKEN },
        signal: controller.signal,
      },
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`order-service returned ${res.status}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { getOrder };
