const { AppError } = require("@reloop/shared");

// How long a dashboard request waits for order-service before giving up.
const ORDER_SERVICE_TIMEOUT_MS = 5000;

const isSale = (item) =>
  item !== null &&
  typeof item === "object" &&
  typeof item.productId === "string" &&
  Number.isInteger(item.count) &&
  item.count >= 0 &&
  typeof item.gmv === "number" &&
  Number.isFinite(item.gmv);

/**
 * Service-to-service client toward order-service for the Executive rankings.
 * Sales amounts live with the orders, so product-service asks for them rather
 * than reading another service's database (CEO-DEC-003). Config is read per
 * call so a test or a deploy can point it elsewhere without a reload.
 */
function createOrderSalesClient({ fetchImpl = globalThis.fetch } = {}) {
  return {
    /** [{productId, count, gmv}] for completed orders placed in [from, to). */
    async getProductSales({ from, to, timezone }) {
      // Without the shared secret order-service would answer 403 and this would
      // read as "order-service returned an error"; say what is actually wrong.
      const token = process.env.INTERNAL_SERVICE_TOKEN;
      if (!token) {
        throw new AppError(500, "INTERNAL_SERVICE_TOKEN is not configured");
      }

      const url = new URL(
        "/internal/executive/product-sales",
        process.env.ORDER_SERVICE_URL || "http://order-service:3003",
      );
      url.search = new URLSearchParams({
        from: from.toISOString(),
        to: to.toISOString(),
        timezone,
      }).toString();

      let response;
      try {
        response = await fetchImpl(url, {
          headers: {
            "x-internal-token": token,
          },
          signal: AbortSignal.timeout(ORDER_SERVICE_TIMEOUT_MS),
        });
      } catch {
        throw new AppError(502, "order-service is unreachable");
      }
      if (!response.ok) {
        throw new AppError(502, "order-service returned an error");
      }

      const body = await response.json().catch(() => null);
      if (!Array.isArray(body?.data) || !body.data.every(isSale)) {
        throw new AppError(502, "order-service returned an invalid response");
      }
      return body.data;
    },
  };
}

module.exports = createOrderSalesClient();
module.exports.createOrderSalesClient = createOrderSalesClient;
