const test = require("node:test");
const assert = require("node:assert/strict");

const client = require("./buyerActivityClient");

function stubFetch(t, implementation) {
  const original = global.fetch;
  global.fetch = implementation;
  t.after(() => {
    global.fetch = original;
  });
}

test("sends an idempotent order activity to auth-service", async (t) => {
  let request;
  stubFetch(t, async (url, init) => {
    request = { url, init };
    return new Response("{}", { status: 201 });
  });

  const recorded = await client.recordOrderActivity(
    {
      id: "order-1",
      buyerId: "buyer-1",
      sellerId: "seller-1",
      productId: "product-1",
      price: 750,
    },
    "PAYMENT_COMPLETED",
    { checkoutSessionId: "checkout-1" },
  );

  assert.equal(recorded, true);
  assert.match(request.url, /\/internal\/buyer-activity$/);
  assert.ok(request.init.headers["x-internal-token"] !== undefined);
  assert.deepEqual(JSON.parse(request.init.body), {
    buyerId: "buyer-1",
    action: "PAYMENT_COMPLETED",
    source: "ORDER_SERVICE",
    targetType: "order",
    targetId: "order-1",
    metadata: {
      productId: "product-1",
      sellerId: "seller-1",
      price: 750,
      checkoutSessionId: "checkout-1",
    },
    requestId: "order:order-1:payment_completed",
    occurredAt: JSON.parse(request.init.body).occurredAt,
  });
});

test("an auth-service outage does not fail the purchase flow", async (t) => {
  stubFetch(t, async () => {
    throw new Error("ECONNREFUSED");
  });
  const originalWarn = console.warn;
  console.warn = () => {};
  t.after(() => {
    console.warn = originalWarn;
  });

  const recorded = await client.recordOrderActivity(
    { id: "order-2", buyerId: "buyer-1" },
    "ORDER_PLACED",
  );
  assert.equal(recorded, false);
});
