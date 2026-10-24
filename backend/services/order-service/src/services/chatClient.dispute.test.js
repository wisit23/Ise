const test = require("node:test");
const assert = require("node:assert/strict");
const { notifyDisputeOpened } = require("./chatClient");

test("opening a buyer dispute only notifies the buyer before seller contact", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    calls.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({}) };
  });
  await notifyDisputeOpened({ id: "d1", reason: "damaged" }, {
    id: "o1", buyerId: "buyer", sellerId: "seller", productTitle: "Shirt",
  });
  assert.deepEqual(calls.map((call) => call.userId), ["buyer"]);
});
