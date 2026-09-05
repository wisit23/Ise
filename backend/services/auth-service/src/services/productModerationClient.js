// Thin service-to-service client toward product-service — same shape as
// order-service/src/services/productClient.js. Admin never writes Product
// rows directly (ADM-DEC-001: owner-service command only, no cross-DB write).
const { AppError } = require("@reloop/shared");

const PRODUCT_SERVICE_URL =
  process.env.PRODUCT_SERVICE_URL || "http://product-service:3002";
const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || "";

async function removeProduct(productId, reason) {
  let res;
  try {
    res = await fetch(
      `${PRODUCT_SERVICE_URL}/internal/moderation/${productId}/remove`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-token": INTERNAL_TOKEN,
        },
        body: JSON.stringify({ reason }),
      },
    );
  } catch {
    throw new AppError(502, "product-service is unreachable");
  }
  if (res.status === 404) throw new AppError(404, "product not found");
  if (res.status === 409) throw new AppError(409, "product already moderated");
  if (!res.ok) throw new AppError(502, "failed to remove product");
  return res.json();
}

async function restoreProduct(productId) {
  let res;
  try {
    res = await fetch(
      `${PRODUCT_SERVICE_URL}/internal/moderation/${productId}/restore`,
      {
        method: "POST",
        headers: { "x-internal-token": INTERNAL_TOKEN },
      },
    );
  } catch {
    throw new AppError(502, "product-service is unreachable");
  }
  if (res.status === 404) throw new AppError(404, "product not found");
  if (res.status === 409) throw new AppError(409, "product is not removed");
  if (!res.ok) throw new AppError(502, "failed to restore product");
  return res.json();
}

module.exports = { removeProduct, restoreProduct };
