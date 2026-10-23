const PAGE_SIZE = 1000;

function createOrderAudienceClient({
  fetchImpl = globalThis.fetch,
  baseUrl,
  internalToken,
} = {}) {
  return {
    async listPurchases({ from, to }) {
      const items = [];
      let page = 1;
      let totalPages = 1;
      do {
        const url = new URL(
          "/internal/marketing-audience/purchases",
          baseUrl || process.env.ORDER_SERVICE_URL || "http://order-service:3003",
        );
        url.searchParams.set("from", from.toISOString());
        url.searchParams.set("to", to.toISOString());
        url.searchParams.set("page", String(page));
        url.searchParams.set("limit", String(PAGE_SIZE));
        const response = await fetchImpl(url, {
          headers: {
            "x-internal-token":
              internalToken || process.env.INTERNAL_SERVICE_TOKEN || "",
          },
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) {
          throw new Error(`order audience unavailable (${response.status})`);
        }
        const payload = await response.json();
        if (!Array.isArray(payload?.items)) {
          throw new Error("invalid order audience response");
        }
        items.push(...payload.items);
        totalPages = Number(payload.totalPages || 1);
        page += 1;
      } while (page <= totalPages);
      return items;
    },
  };
}

module.exports = createOrderAudienceClient();
module.exports.createOrderAudienceClient = createOrderAudienceClient;
