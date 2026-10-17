function createShopSearchClient({ fetchImpl, baseUrl } = {}) {
  return {
    async findSellerIds(q) {
      if (!q?.trim()) return [];
      const response = await (fetchImpl || globalThis.fetch)(
        new URL(
          "/internal/shops/search",
          baseUrl ||
            process.env.AUTH_SERVICE_INTERNAL_URL ||
            process.env.AUTH_SERVICE_URL ||
            "http://auth-service:3001",
        ),
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-internal-token": process.env.INTERNAL_SERVICE_TOKEN || "",
          },
          body: JSON.stringify({ q: q.trim() }),
          signal: AbortSignal.timeout(3000),
        },
      );
      if (!response.ok)
        throw new Error(`Shop search unavailable (${response.status})`);
      const result = await response.json();
      if (
        !Array.isArray(result?.sellerIds) ||
        result.sellerIds.some((id) => typeof id !== "string" || !id)
      )
        throw new Error("Invalid shop search response");
      return [...new Set(result.sellerIds)];
    },
  };
}

module.exports = createShopSearchClient();
module.exports.createShopSearchClient = createShopSearchClient;
