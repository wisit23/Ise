const test = require("node:test");
const assert = require("node:assert/strict");
const { createOrderSalesClient } = require("./orderSalesClient");

const range = {
  from: new Date("2026-09-30T17:00:00.000Z"),
  to: new Date("2026-10-14T17:00:00.000Z"),
  timezone: "Asia/Bangkok",
};

function clientWith(respond) {
  const calls = [];
  const client = createOrderSalesClient({
    fetchImpl: async (url, init) => {
      calls.push({ url: new URL(url), init });
      return respond();
    },
  });
  return { client, calls };
}

const json = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

test.beforeEach(() => {
  process.env.ORDER_SERVICE_URL = "http://order.test:3003";
  process.env.INTERNAL_SERVICE_TOKEN = "client-test-token";
});

test("asks order-service for the window with the service token", async () => {
  const sales = [{ productId: "p1", count: 2, gmv: 1900 }];
  const { client, calls } = clientWith(() => json({ data: sales }));

  assert.deepEqual(await client.getProductSales(range), sales);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.origin, "http://order.test:3003");
  assert.equal(calls[0].url.pathname, "/internal/executive/product-sales");
  assert.equal(
    calls[0].url.searchParams.get("from"),
    "2026-09-30T17:00:00.000Z",
  );
  assert.equal(calls[0].url.searchParams.get("to"), "2026-10-14T17:00:00.000Z");
  assert.equal(calls[0].url.searchParams.get("timezone"), "Asia/Bangkok");
  assert.equal(calls[0].init.headers["x-internal-token"], "client-test-token");
});

test("accepts an empty list", async () => {
  const { client } = clientWith(() => json({ data: [] }));
  assert.deepEqual(await client.getProductSales(range), []);
});

test("reports order-service as unavailable when it cannot be reached", async () => {
  const client = createOrderSalesClient({
    fetchImpl: async () => {
      throw new Error("connect ECONNREFUSED");
    },
  });
  await assert.rejects(client.getProductSales(range), (err) => {
    assert.equal(err.status, 502);
    return true;
  });
});

test("reports order-service as unavailable when it answers with an error", async () => {
  const { client } = clientWith(() => json({ error: "boom" }, 500));
  await assert.rejects(client.getProductSales(range), (err) => {
    assert.equal(err.status, 502);
    return true;
  });
});

test("rejects a malformed answer instead of ranking on it", async () => {
  for (const body of [
    null,
    {},
    { data: "x" },
    { data: [null] },
    { data: [{ productId: 7, count: 1, gmv: 1 }] },
    { data: [{ productId: "p", count: 1.5, gmv: 1 }] },
    { data: [{ productId: "p", count: 1, gmv: "1" }] },
    { data: [{ productId: "p", count: 1, gmv: Number.NaN }] },
  ]) {
    const { client } = clientWith(() => json(body));
    await assert.rejects(
      client.getProductSales(range),
      (err) => err.status === 502,
      JSON.stringify(body),
    );
  }
});

test("rejects an answer that is not JSON", async () => {
  const { client } = clientWith(() => ({
    ok: true,
    status: 200,
    json: async () => {
      throw new SyntaxError("Unexpected token");
    },
  }));
  await assert.rejects(
    client.getProductSales(range),
    (err) => err.status === 502,
  );
});

test("fails with a clear error when the service token is not configured", async () => {
  delete process.env.INTERNAL_SERVICE_TOKEN;
  let called = false;
  const client = createOrderSalesClient({
    fetchImpl: async () => {
      called = true;
      return { ok: true, json: async () => ({ data: [] }) };
    },
  });

  await assert.rejects(
    client.getProductSales(range),
    (err) => err.status === 500 && /INTERNAL_SERVICE_TOKEN/.test(err.message),
  );
  // It does not send a request that is certain to be refused.
  assert.equal(called, false);
});
