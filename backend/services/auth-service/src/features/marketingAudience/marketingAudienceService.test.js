const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createMarketingAudienceService,
  profileView,
} = require("./marketingAudienceService");

test("profile view keeps multiple preferences and associates sizes with category", () => {
  assert.deepEqual(
    profileView([
      { kind: "CATEGORY", value: "รองเท้า" },
      { kind: "CATEGORY", value: "เสื้อ" },
      { kind: "BRAND", value: "Nike" },
      { kind: "STYLE", value: "Running" },
      { kind: "SIZE", category: "รองเท้า", value: "42" },
      { kind: "SIZE", category: "รองเท้า", value: "43" },
    ]),
    {
      categories: ["รองเท้า", "เสื้อ"],
      styles: ["Running"],
      brands: ["Nike"],
      sizes: [{ category: "รองเท้า", values: ["42", "43"] }],
    },
  );
});

test("buyer profile API shape is paginated and contains no account details", async () => {
  let request;
  const service = createMarketingAudienceService({
    listBuyerProfiles: async (input) => {
      request = input;
      return {
        total: 1,
        items: [
          {
            id: "buyer-1",
            email: "must-not-leak@example.test",
            buyerProfile: {
              preferences: [{ kind: "BRAND", value: "Nike" }],
            },
          },
        ],
      };
    },
  });

  const result = await service.listBuyerProfiles({ page: "2", limit: "20" });
  assert.deepEqual(request, { skip: 20, take: 20 });
  assert.equal(result.items[0].userId, "buyer-1");
  assert.equal(result.items[0].profile.brands[0], "Nike");
  assert.equal(Object.hasOwn(result.items[0], "email"), false);
});
