function createPurchaseHistoryClient({
  fetchImpl = globalThis.fetch,
  baseUrl,
} = {}) {
  return {
    async get(authorization) {
      const response = await fetchImpl(
        new URL(
          "/recommendation-history",
          baseUrl ||
            process.env.ORDER_SERVICE_URL ||
            "http://order-service:3003",
        ),
        {
          headers: { authorization },
          signal: AbortSignal.timeout(3000),
        },
      );
      if (!response.ok)
        throw new Error(`Purchase history unavailable (${response.status})`);
      const data = await response.json();
      if (!Array.isArray(data?.items))
        throw new Error("Invalid purchase history");
      return data.items.slice(0, 50);
    },
  };
}
module.exports = createPurchaseHistoryClient();
module.exports.createPurchaseHistoryClient = createPurchaseHistoryClient;
