const test = require("node:test");
const assert = require("node:assert/strict");
const {
  notifyCampaignAudience,
} = require("../auctions/chatClient");

test("targeted campaign notification is individual, deduplicated, and links to coupons", async (t) => {
  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return { ok: true, json: async () => ({ id: "notification" }) };
  };
  t.after(() => {
    global.fetch = originalFetch;
  });

  const result = await notifyCampaignAudience({
    campaign: { id: "campaign-1", code: "NIKE15", name: "Nike Fans" },
    userIds: ["buyer-a", "buyer-a", "buyer-b"],
  });

  assert.equal(result.deliveredCount, 2);
  assert.equal(result.failedCount, 0);
  assert.equal(requests.length, 2);
  assert.deepEqual(
    requests.map((request) => request.body.userId),
    ["buyer-a", "buyer-b"],
  );
  for (const request of requests) {
    assert.equal(request.body.type, "DISCOUNT");
    assert.equal(request.body.link, "/campaigns");
    assert.equal(request.body.entityId, "campaign-1");
    assert.equal(request.body.metadata.targeted, true);
  }
});
