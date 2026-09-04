// Thin service-to-service client toward product-service, mirroring the
// pattern in order-service/src/services/productClient.js. `GET /:id` is a
// public route (see gateway PUBLIC_PATHS), so no internal token is needed.
const { AppError } = require("@reloop/shared");

const PRODUCT_SERVICE_URL =
  process.env.PRODUCT_SERVICE_URL || "http://product-service:3002";

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

module.exports = { getProduct };
