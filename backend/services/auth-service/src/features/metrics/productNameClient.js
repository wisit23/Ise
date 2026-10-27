const { AppError } = require("@reloop/shared");

// How long a complaints page waits for product-service before giving up, and
// how many product ids one request carries (product-service refuses more).
const PRODUCT_NAMES_TIMEOUT_MS = 3000;
const PRODUCT_NAMES_BATCH = 100;

/**
 * Service-to-service client toward product-service for the Executive
 * complaints: the names of the products complaints are about, by id, in one
 * request. Sold and deleted products are included (a deleted one flagged), so
 * a complaint still says which product it was about. Config is read per call.
 */
function createProductNameClient({ fetchImpl = globalThis.fetch } = {}) {
  return {
    /** @returns {Promise<Map<string, {title: string, deleted: boolean}>>} */
    async getNames(ids) {
      const unique = [...new Set(ids.filter(Boolean))];
      const names = new Map();
      if (unique.length === 0) return names;

      const token = process.env.INTERNAL_SERVICE_TOKEN;
      if (!token) {
        throw new AppError(500, "INTERNAL_SERVICE_TOKEN is not configured");
      }
      const base =
        process.env.PRODUCT_SERVICE_URL || "http://product-service:3002";

      for (let i = 0; i < unique.length; i += PRODUCT_NAMES_BATCH) {
        let response;
        try {
          response = await fetchImpl(
            new URL("/internal/executive/product-names", base),
            {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "x-internal-token": token,
              },
              body: JSON.stringify({
                ids: unique.slice(i, i + PRODUCT_NAMES_BATCH),
              }),
              signal: AbortSignal.timeout(PRODUCT_NAMES_TIMEOUT_MS),
            },
          );
        } catch {
          throw new AppError(502, "product-service is unreachable");
        }
        if (!response.ok) {
          throw new AppError(502, "product-service returned an error");
        }
        const body = await response.json().catch(() => null);
        if (
          !Array.isArray(body?.data) ||
          body.data.some(
            (row) =>
              typeof row?.id !== "string" ||
              typeof row?.title !== "string" ||
              typeof row?.deleted !== "boolean",
          )
        ) {
          throw new AppError(502, "product-service returned an invalid response");
        }
        for (const row of body.data) {
          names.set(row.id, { title: row.title, deleted: row.deleted });
        }
      }
      return names;
    },
  };
}

module.exports = createProductNameClient();
module.exports.createProductNameClient = createProductNameClient;
