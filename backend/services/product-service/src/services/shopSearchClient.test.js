const test = require("node:test");
const assert = require("node:assert/strict");
const { createShopSearchClient } = require("./shopSearchClient");

test("shop lookup sends a trimmed query and internal credentials; deduplicates ids", async () => {
  const client = createShopSearchClient({
    baseUrl: "http://auth.test",
    fetchImpl: async (url, options) => {
      assert.equal(url.href, "http://auth.test/internal/shops/search");
      assert.equal(options.method, "POST");
      assert.equal(options.headers["x-internal-token"], process.env.INTERNAL_SERVICE_TOKEN || "");
      assert.deepEqual(JSON.parse(options.body), { q: "ร้านดาบ" });
      assert.ok(options.signal instanceof AbortSignal);
      return { ok: true, json: async () => ({ sellerIds: ["a", "a", "b"] }) };
    },
  });
  assert.deepEqual(await client.findSellerIds(" ร้านดาบ "), ["a", "b"]);
});

test("empty queries do not call auth", async () => {
  const client = createShopSearchClient({ fetchImpl: () => assert.fail("unexpected lookup") });
  assert.deepEqual(await client.findSellerIds("  "), []);
});

test("shop lookup rejects HTTP errors, malformed data and network errors", async () => {
  for (const fetchImpl of [
    async () => ({ ok: false, status: 503 }),
    async () => ({ ok: true, json: async () => ({ sellerIds: "a" }) }),
    async () => ({ ok: true, json: async () => ({ sellerIds: [null] }) }),
    async () => { throw new Error("offline"); },
  ]) {
    await assert.rejects(createShopSearchClient({ fetchImpl }).findSellerIds("shop"));
  }
});
