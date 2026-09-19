const test = require("node:test");
const assert = require("node:assert/strict");

const { createCampaignService } = require("../src/features/campaigns/campaignService");

test("Campaign Validation, Normalization, Gating & Claim Concurrency Unit Suite", async (t) => {
  const futureStart = new Date(Date.now() + 10000);
  const futureEnd = new Date(Date.now() + 86400000);
  const now = new Date();

  // Mock repository factory
  function createMockRepo(overrides = {}) {
    return {
      createCampaign: async (data) => ({ id: "camp-uuid-1", ...data, claimedCount: 0, redeemedCount: 0 }),
      findById: async (id) => ({
        id,
        code: "SUMMER50",
        name: "Summer Sale",
        status: "draft",
        discountType: "PERCENT",
        discountValue: 20,
        minOrderPrice: 100,
        maxDiscount: 50,
        startsAt: new Date(Date.now() - 3600000),
        endsAt: new Date(Date.now() + 86400000),
        usageLimit: 10,
        usedCount: 0,
        claimedCount: 0,
        redeemedCount: 0,
      }),
      findByCode: async () => null,
      updateCampaign: async (id, data) => ({ id, ...data }),
      findVoucher: async () => null,
      createVoucher: async ({ campaignId, userId }) => ({ id: "v-1", campaignId, userId, status: "CLAIMED" }),
      incrementUsedCount: async () => {},
      claimVoucherAtomic: async ({ userId, campaignId }) => ({ id: "v-atomic-1", campaignId, userId, status: "CLAIMED" }),
      ...overrides,
    };
  }

  const marketingUser = { id: "mkt-1", role: "MARKETING" };
  const buyerUser = { id: "buyer-1", role: "BUYER" };

  await t.test("Code Normalization: trims and converts code to UPPERCASE", async () => {
    let savedData;
    const repo = createMockRepo({
      createCampaign: async (data) => {
        savedData = data;
        return { id: "camp-1", ...data };
      },
    });
    const service = createCampaignService(repo);

    await service.createDraft({
      user: marketingUser,
      input: {
        code: "  promo_flash_2026  ",
        name: "Flash Sale",
        discountType: "PERCENT",
        discountValue: 10,
        startsAt: futureStart.toISOString(),
        endsAt: futureEnd.toISOString(),
      },
    });

    assert.equal(savedData.code, "PROMO_FLASH_2026");
  });

  await t.test("Validation on Create: rejects percent discount > 100", async () => {
    const service = createCampaignService(createMockRepo());

    await assert.rejects(
      () =>
        service.createDraft({
          user: marketingUser,
          input: {
            code: "DISC150",
            name: "Invalid Percent",
            discountType: "PERCENT",
            discountValue: 150,
            startsAt: futureStart.toISOString(),
            endsAt: futureEnd.toISOString(),
          },
        }),
      (err) => {
        assert.equal(err.status, 400);
        assert.match(err.message, /percent discountValue must be between 1 and 100/i);
        return true;
      }
    );
  });

  await t.test("Validation on Create: rejects startsAt >= endsAt", async () => {
    const service = createCampaignService(createMockRepo());

    await assert.rejects(
      () =>
        service.createDraft({
          user: marketingUser,
          input: {
            code: "INVDATE",
            name: "Invalid Dates",
            discountType: "FIXED",
            discountValue: 50,
            startsAt: futureEnd.toISOString(),
            endsAt: futureStart.toISOString(),
          },
        }),
      (err) => {
        assert.equal(err.status, 400);
        assert.match(err.message, /endsAt must be after startsAt/i);
        return true;
      }
    );
  });

  await t.test("Validation on Partial Update: rejects changing discountValue > 100 when existing is PERCENT", async () => {
    const repo = createMockRepo({
      findById: async (id) => ({
        id,
        code: "CAMP_EXIST",
        name: "Existing Campaign",
        status: "draft",
        discountType: "PERCENT",
        discountValue: 15,
        startsAt: futureStart,
        endsAt: futureEnd,
      }),
    });
    const service = createCampaignService(repo);

    await assert.rejects(
      () =>
        service.updateDraft({
          user: marketingUser,
          campaignId: "camp-exist",
          input: {
            discountValue: 120, // > 100 while effective type is PERCENT
          },
        }),
      (err) => {
        assert.equal(err.status, 400);
        assert.match(err.message, /percent discountValue must be between 1 and 100/i);
        return true;
      }
    );
  });

  await t.test("Validation on Partial Update: rejects changing discountType to PERCENT when existing value > 100", async () => {
    const repo = createMockRepo({
      findById: async (id) => ({
        id,
        code: "FIXED_CAMP",
        name: "Existing Fixed Campaign",
        status: "draft",
        discountType: "FIXED",
        discountValue: 250, // 250 baht
        startsAt: futureStart,
        endsAt: futureEnd,
      }),
    });
    const service = createCampaignService(repo);

    await assert.rejects(
      () =>
        service.updateDraft({
          user: marketingUser,
          campaignId: "fixed-camp",
          input: {
            discountType: "PERCENT", // changing to PERCENT while existing value is 250
          },
        }),
      (err) => {
        assert.equal(err.status, 400);
        assert.match(err.message, /percent discountValue must be between 1 and 100/i);
        return true;
      }
    );
  });

  await t.test("Validation on Partial Update: rejects partial date update where new startsAt >= existing endsAt", async () => {
    const existingStart = new Date("2026-06-01T00:00:00Z");
    const existingEnd = new Date("2026-06-10T00:00:00Z");
    const repo = createMockRepo({
      findById: async (id) => ({
        id,
        code: "DATE_CAMP",
        name: "Date Camp",
        status: "draft",
        discountType: "FIXED",
        discountValue: 20,
        startsAt: existingStart,
        endsAt: existingEnd,
      }),
    });
    const service = createCampaignService(repo);

    await assert.rejects(
      () =>
        service.updateDraft({
          user: marketingUser,
          campaignId: "date-camp",
          input: {
            startsAt: "2026-06-15T00:00:00Z", // after existing endsAt
          },
        }),
      (err) => {
        assert.equal(err.status, 400);
        assert.match(err.message, /endsAt must be after startsAt/i);
        return true;
      }
    );
  });

  await t.test("Gating non-published campaigns: hides draft/pending/rejected/ended from Guest and Buyer", async () => {
    const repo = createMockRepo({
      findById: async (id) => ({
        id,
        code: "SECRET_DRAFT",
        name: "Unreleased Promo",
        status: "draft",
        startsAt: futureStart,
        endsAt: futureEnd,
      }),
    });
    const service = createCampaignService(repo);

    // Guest without user context -> 404
    await assert.rejects(
      () => service.getCampaign({ user: null, campaignId: "secret-draft" }),
      (err) => {
        assert.equal(err.status, 404);
        return true;
      }
    );

    // Buyer -> 404
    await assert.rejects(
      () => service.getCampaign({ user: buyerUser, campaignId: "secret-draft" }),
      (err) => {
        assert.equal(err.status, 404);
        return true;
      }
    );

    // Marketing -> 200 OK
    const marketingView = await service.getCampaign({ user: marketingUser, campaignId: "secret-draft" });
    assert.equal(marketingView.code, "SECRET_DRAFT");
    assert.equal(marketingView.status, "draft");
  });

  await t.test("Gating published campaigns: allows Guest and Buyer if active", async () => {
    const repo = createMockRepo({
      findById: async (id) => ({
        id,
        code: "PUBLIC_ACTIVE",
        name: "Live Campaign",
        status: "published",
        startsAt: new Date(Date.now() - 3600000),
        endsAt: new Date(Date.now() + 86400000),
      }),
    });
    const service = createCampaignService(repo);

    const guestView = await service.getCampaign({ user: null, campaignId: "pub-1" });
    assert.equal(guestView.code, "PUBLIC_ACTIVE");

    const buyerView = await service.getCampaign({ user: buyerUser, campaignId: "pub-1" });
    assert.equal(buyerView.code, "PUBLIC_ACTIVE");
  });

  await t.test("Claim Concurrency & Usage Limit: returns 409 Conflict when usageLimit reached", async () => {
    const repo = createMockRepo({
      findById: async (id) => ({
        id,
        code: "LIMITED",
        name: "Limited Promo",
        status: "published",
        startsAt: new Date(Date.now() - 3600000),
        endsAt: new Date(Date.now() + 86400000),
        usageLimit: 5,
        usedCount: 5, // Full quota
      }),
    });
    const service = createCampaignService(repo);

    await assert.rejects(
      () => service.claimVoucher({ user: buyerUser, campaignId: "limited-id" }),
      (err) => {
        assert.equal(err.status, 409);
        assert.match(err.message, /campaign usage limit reached/i);
        return true;
      }
    );
  });

  await t.test("Claim Concurrency: returns 409 Conflict when user already claimed", async () => {
    const repo = createMockRepo({
      findById: async (id) => ({
        id,
        code: "ONCE_ONLY",
        name: "Once Only Promo",
        status: "published",
        startsAt: new Date(Date.now() - 3600000),
        endsAt: new Date(Date.now() + 86400000),
        usageLimit: 100,
        usedCount: 1,
      }),
      findVoucher: async () => ({ id: "existing-voucher", status: "CLAIMED" }),
    });
    const service = createCampaignService(repo);

    await assert.rejects(
      () => service.claimVoucher({ user: buyerUser, campaignId: "once-id" }),
      (err) => {
        assert.equal(err.status, 409);
        assert.match(err.message, /voucher already claimed by user/i);
        return true;
      }
    );
  });

  await t.test("Segmentation Validation: rejects invalid segment rule on createDraft", async () => {
    const service = createCampaignService(createMockRepo());

    await assert.rejects(
      () =>
        service.createDraft({
          user: marketingUser,
          input: {
            code: "BAD_SEG",
            name: "Bad Segment Campaign",
            discountType: "FIXED",
            discountValue: 10,
            startsAt: futureStart.toISOString(),
            endsAt: futureEnd.toISOString(),
            targetSegment: {
              type: "rules",
              rules: [{ field: "nonExistentField", operator: "eq", value: "test" }],
            },
          },
        }),
      (err) => {
        assert.equal(err.status, 400);
        assert.match(err.message, /invalid segment field/i);
        return true;
      }
    );
  });

  await t.test("Segmentation Filtering: listAvailablePublicCampaigns matches targeted profile", async () => {
    const repo = createMockRepo({
      listAvailableCampaigns: async () => [
        {
          id: "camp-all",
          code: "ALL_BUYERS",
          targetSegment: null,
        },
        {
          id: "camp-street",
          code: "STREETWEAR_ONLY",
          targetSegment: {
            type: "rules",
            rules: [{ field: "styleTag", operator: "eq", value: "Streetwear" }],
          },
        },
      ],
    });
    const service = createCampaignService(repo);

    // Profile without styleTag gets only general campaign
    const resNoMatch = await service.listAvailablePublicCampaigns({ profile: { styleTag: "Vintage" } });
    assert.equal(resNoMatch.length, 1);
    assert.equal(resNoMatch[0].code, "ALL_BUYERS");

    // Profile with Streetwear gets both
    const resMatch = await service.listAvailablePublicCampaigns({ profile: { styleTag: "streetwear" } });
    assert.equal(resMatch.length, 2);
  });
});
