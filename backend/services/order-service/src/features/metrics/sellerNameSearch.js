const { AppError, normalizeReferenceCode } = require("@reloop/shared");

// How long the Executive list waits for auth-service to find shops by name.
const SHOP_SEARCH_TIMEOUT_MS = 3000;

/**
 * The ids of the users whose shop or personal name matches `q`, asked of
 * auth-service (shop names live there; order-service never reads that table).
 * Disputes use the ones that are the seller of an order. Account status is
 * not a filter: a suspended shop is exactly one the executive may look up.
 *
 * Skipped for a whole reference code, which names a case, not a shop. When
 * auth-service cannot answer this throws 502, so the page says disputes are
 * unavailable instead of showing "none found".
 */
function createSellerNameSearch({ fetchImpl = globalThis.fetch } = {}) {
  return {
    async findUserIds(q) {
      if (!q || normalizeReferenceCode(q)) return [];
      const token = process.env.INTERNAL_SERVICE_TOKEN;
      if (!token) {
        throw new AppError(500, "INTERNAL_SERVICE_TOKEN is not configured");
      }
      const base = process.env.AUTH_SERVICE_URL || "http://auth-service:3001";
      const signal = AbortSignal.timeout(SHOP_SEARCH_TIMEOUT_MS);
      const ids = new Set();
      const cursors = new Set();
      let cursor;
      do {
        let body;
        try {
          const response = await fetchImpl(
            new URL("/executive/seller-search", base),
            {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "x-internal-token": token,
              },
              body: JSON.stringify({ q, ...(cursor ? { cursor } : {}) }),
              signal,
            },
          );
          if (!response.ok) throw new Error("auth-service returned an error");
          body = await response.json();
          signal.throwIfAborted();
        } catch {
          throw new AppError(502, "auth-service search is unavailable");
        }
        if (
          !Array.isArray(body?.sellerIds) ||
          body.sellerIds.some((id) => typeof id !== "string" || !id) ||
          !(
            body.nextCursor === null ||
            (typeof body.nextCursor === "string" && body.nextCursor.length > 0)
          ) ||
          (body.nextCursor !== null &&
            (cursors.has(body.nextCursor) ||
              !body.sellerIds.includes(body.nextCursor)))
        ) {
          throw new AppError(502, "auth-service returned an invalid response");
        }
        for (const id of body.sellerIds) ids.add(id);
        cursor = body.nextCursor;
        if (cursor) cursors.add(cursor);
      } while (cursor);
      return [...ids];
    },
  };
}

module.exports = createSellerNameSearch();
module.exports.createSellerNameSearch = createSellerNameSearch;
