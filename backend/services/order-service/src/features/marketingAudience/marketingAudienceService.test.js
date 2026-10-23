const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createMarketingAudienceService,
} = require("./marketingAudienceService");

test("purchase signal API returns paid purchase timestamps with pagination", async () => {
  const paidAt = new Date("2026-10-10T08:00:00.000Z");
  let request;
  const service = createMarketingAudienceService({
    listPurchases: async (input) => {
      request = input;
      return {
        total: 1,
        orders: [
          {
            buyerId: "buyer-1",
            productId: "product-1",
            payments: [{ paidAt }],
          },
        ],
      };
    },
  });

  const result = await service.listPurchases({
    from: "2026-10-01T00:00:00.000Z",
    to: "2026-10-18T00:00:00.000Z",
    page: "2",
    limit: "25",
  });

  assert.equal(request.skip, 25);
  assert.equal(request.take, 25);
  assert.deepEqual(result.items, [
    { userId: "buyer-1", productId: "product-1", purchasedAt: paidAt },
  ]);
});

test("purchase signal API rejects inverted date ranges", async () => {
  const service = createMarketingAudienceService({ listPurchases: async () => ({}) });
  await assert.rejects(
    () =>
      service.listPurchases({
        from: "2026-10-18T00:00:00.000Z",
        to: "2026-10-01T00:00:00.000Z",
      }),
    /from must be before to/,
  );
});

test("purchase signal API bounds marketing history to 180 days", async () => {
  const service = createMarketingAudienceService({ listPurchases: async () => ({}) });
  await assert.rejects(
    () =>
      service.listPurchases({
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-10-18T00:00:00.000Z",
      }),
    /must not exceed 180 days/,
  );
});
