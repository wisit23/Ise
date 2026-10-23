const { AppError } = require("@reloop/shared");

const ORDER_SERVICE_URL =
  process.env.ORDER_SERVICE_URL || "http://order-service:3003";

async function getOrder(orderId) {
  try {
    const response = await fetch(
      `${ORDER_SERVICE_URL}/${encodeURIComponent(orderId)}/internal`,
      {
        headers: { "x-internal-token": process.env.INTERNAL_SERVICE_TOKEN || "" },
        signal: AbortSignal.timeout(2000),
      },
    );
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`order-service returned ${response.status}`);
    return await response.json();
  } catch {
    throw new AppError(503, "ไม่สามารถตรวจสอบคำสั่งซื้อได้ กรุณาลองอีกครั้ง");
  }
}

module.exports = { getOrder };
