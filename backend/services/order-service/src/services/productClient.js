// Thin service-to-service client toward product-service. Kept isolated so the
// mock in-memory version and a future real one behave identically to callers.
const { AppError } = require("@reloop/shared");

const PRODUCT_SERVICE_URL =
  process.env.PRODUCT_SERVICE_URL || "http://product-service:3002";
const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || "";

async function getProduct(productId) {
  let res;
  try {
    res = await fetch(`${PRODUCT_SERVICE_URL}/${productId}`);
  } catch {
    throw new AppError(502, "product-service is unreachable");
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new AppError(502, "product-service returned an error");
  return res.json();
}

async function setProductStatus(productId, status) {
  let res;
  try {
    res = await fetch(`${PRODUCT_SERVICE_URL}/${productId}/internal-status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-internal-token": INTERNAL_TOKEN,
      },
      body: JSON.stringify({ status }),
    });
  } catch {
    throw new AppError(502, "product-service is unreachable");
  }
  if (!res.ok) throw new AppError(502, "failed to update product status");
  return res.json();
}

module.exports = { getProduct, setProductStatus };
