const PAGE_SIZE = 500;

function createAuthAudienceClient({
  fetchImpl = globalThis.fetch,
  baseUrl,
  internalToken,
} = {}) {
  return {
    async listBuyerProfiles() {
      const items = [];
      let page = 1;
      let totalPages = 1;
      do {
        const url = new URL(
          "/internal/marketing-audience/buyer-profiles",
          baseUrl ||
            process.env.AUTH_SERVICE_INTERNAL_URL ||
            process.env.AUTH_SERVICE_URL ||
            "http://auth-service:3001",
        );
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
          throw new Error(`auth audience unavailable (${response.status})`);
        }
        const payload = await response.json();
        if (!Array.isArray(payload?.items)) {
          throw new Error("invalid auth audience response");
        }
        items.push(...payload.items);
        totalPages = Number(payload.totalPages || 1);
        page += 1;
      } while (page <= totalPages);
      return items;
    },
  };
}

module.exports = createAuthAudienceClient();
module.exports.createAuthAudienceClient = createAuthAudienceClient;
