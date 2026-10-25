const test = require("node:test");
const assert = require("node:assert/strict");
const { getOrder } = require("./orderClient");

test("order lookup uses the internal endpoint and token", async (t) => {
  const originalToken = process.env.INTERNAL_SERVICE_TOKEN;
  process.env.INTERNAL_SERVICE_TOKEN = "test-internal-token";
  t.after(() => {
    if (originalToken === undefined) delete process.env.INTERNAL_SERVICE_TOKEN;
    else process.env.INTERNAL_SERVICE_TOKEN = originalToken;
  });
  const fetch = t.mock.method(global, "fetch", async () => ({
    ok: true, json: async () => ({ id: "order/1", buyerId: "buyer" }),
  }));
  assert.equal((await getOrder("order/1")).buyerId, "buyer");
  const [url, options] = fetch.mock.calls[0].arguments;
  assert.ok(url.endsWith("/order%2F1/internal"));
  assert.equal(options.headers["x-internal-token"], "test-internal-token");
  assert.ok(options.signal instanceof AbortSignal);
});

test("missing order returns null", async (t) => {
  t.mock.method(global, "fetch", async () => ({ status: 404 }));
  assert.equal(await getOrder("missing"), null);
});

for (const [reason, response] of [
  ["unreachable service", async () => { throw new Error("offline"); }],
  ["service error", async () => ({ ok: false, status: 500 })],
  ["invalid JSON", async () => ({ ok: true, json: async () => { throw new Error("invalid JSON"); } })],
]) {
  test(`lookup fails closed for ${reason}`, async (t) => {
    t.mock.method(global, "fetch", response);
    await assert.rejects(getOrder("order-1"), (err) => err.status === 503);
  });
}
