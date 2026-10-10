const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createCampaignService,
} = require("../src/features/campaigns/campaignService");

test("Campaign Validation, Normalization, Gating & Claim Concurrency Unit Suite", async (t) => {
  const futureStart = new Date(Date.now() + 10000);
  const futureEnd = new Date(Date.now() + 86400000);
  // Mock repository factory
  function createMockRepo(overrides = {}) {
    const repo = {
      createCampaign: async (data) => ({
        id: "camp-uuid-1",
        ...data,
        claimedCount: 0,
        redeemedCount: 0,
      }),
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
      createVoucher: async ({ campaignId, userId }) => ({
        id: "v-1",
        campaignId,
        userId,
        status: "CLAIMED",
      }),
      incrementUsedCount: async () => {},
      claimVoucherAtomic: async ({ userId, campaignId }) => ({
        id: "v-atomic-1",
        campaignId,
        userId,
        status: "CLAIMED",
      }),
      marketingAuditLog: {
        create: async () => ({ id: "audit-1" }),
        createMany: async () => ({ count: 1 }),
      },
      transaction: async (fn) => fn(repo),
      ...overrides,
    };
    return repo;
  }

  const marketingUser = { id: "mkt-1", role: "MARKETING" };
  const buyerUser = { id: "buyer-1", role: "BUYER" };

  await t.test(
    "Code Normalization: trims and converts code to UPPERCASE",
    async () => {
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
    },
  );

  await t.test(
    "Validation on Create: rejects percent discount > 100",
    async () => {
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
          assert.match(
            err.message,
            /percent discountValue must be between 1 and 100/i,
          );
          return true;
        },
      );
    },
  );

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
        assert.match(
          err.message,
          /วันเวลาสิ้นสุดต้องอยู่หลังวันเวลาเริ่มต้น|endsAt must be after startsAt/i,
        );
        return true;
      },
    );
  });

  await t.test(
    "Validation on Partial Update: rejects changing discountValue > 100 when existing is PERCENT",
    async () => {
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
          assert.match(
            err.message,
            /percent discountValue must be between 1 and 100/i,
          );
          return true;
        },
      );
    },
  );

  await t.test(
    "Validation on Partial Update: rejects changing discountType to PERCENT when existing value > 100",
    async () => {
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
          assert.match(
            err.message,
            /percent discountValue must be between 1 and 100/i,
          );
          return true;
        },
      );
    },
  );

  await t.test(
    "Validation on Partial Update: rejects partial date update where new startsAt >= existing endsAt",
    async () => {
      const existingStart = futureStart;
      const existingEnd = futureEnd;
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
              startsAt: new Date(existingEnd.getTime() + 1000).toISOString(), // after existing endsAt
            },
          }),
        (err) => {
          assert.equal(err.status, 400);
          assert.match(
            err.message,
            /วันเวลาสิ้นสุดต้องอยู่หลังวันเวลาเริ่มต้น|endsAt must be after startsAt/i,
          );
          return true;
        },
      );
    },
  );

  await t.test(
    "Gating non-published campaigns: hides draft/pending/rejected/ended from Guest and Buyer",
    async () => {
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
        },
      );

      // Buyer -> 404
      await assert.rejects(
        () =>
          service.getCampaign({ user: buyerUser, campaignId: "secret-draft" }),
        (err) => {
          assert.equal(err.status, 404);
          return true;
        },
      );

      // Marketing -> 200 OK
      const marketingView = await service.getCampaign({
        user: marketingUser,
        campaignId: "secret-draft",
      });
      assert.equal(marketingView.code, "SECRET_DRAFT");
      assert.equal(marketingView.status, "draft");
    },
  );

  await t.test(
    "Gating published campaigns: allows Guest and Buyer if active",
    async () => {
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

      const guestView = await service.getCampaign({
        user: null,
        campaignId: "pub-1",
      });
      assert.equal(guestView.code, "PUBLIC_ACTIVE");

      const buyerView = await service.getCampaign({
        user: buyerUser,
        campaignId: "pub-1",
      });
      assert.equal(buyerView.code, "PUBLIC_ACTIVE");
    },
  );

  await t.test(
    "Claim Concurrency & Usage Limit: returns 409 Conflict when usageLimit reached",
    async () => {
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
        () =>
          service.claimVoucher({ user: buyerUser, campaignId: "limited-id" }),
        (err) => {
          assert.equal(err.status, 409);
          assert.match(err.message, /campaign usage limit reached/i);
          return true;
        },
      );
    },
  );

  await t.test(
    "Claim Concurrency: returns 409 Conflict when user already claimed",
    async () => {
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
        findVoucher: async () => ({
          id: "existing-voucher",
          status: "CLAIMED",
        }),
      });
      const service = createCampaignService(repo);

      await assert.rejects(
        () => service.claimVoucher({ user: buyerUser, campaignId: "once-id" }),
        (err) => {
          assert.equal(err.status, 409);
          assert.match(err.message, /voucher already claimed by user/i);
          return true;
        },
      );
    },
  );

  await t.test(
    "Segmentation Validation: rejects invalid segment rule on createDraft",
    async () => {
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
                rules: [
                  { field: "nonExistentField", operator: "eq", value: "test" },
                ],
              },
            },
          }),
        (err) => {
          assert.equal(err.status, 400);
          assert.match(err.message, /invalid segment field/i);
          return true;
        },
      );
    },
  );

  await t.test(
    "Segmentation Filtering: listAvailablePublicCampaigns matches targeted profile",
    async () => {
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
              rules: [
                { field: "styleTag", operator: "eq", value: "Streetwear" },
              ],
            },
          },
        ],
      });
      const service = createCampaignService(repo);

      // Profile without styleTag gets only general campaign
      const resNoMatch = await service.listAvailablePublicCampaigns({
        profile: { styleTag: "Vintage" },
      });
      assert.equal(resNoMatch.length, 1);
      assert.equal(resNoMatch[0].code, "ALL_BUYERS");

      // Profile with Streetwear gets both
      const resMatch = await service.listAvailablePublicCampaigns({
        profile: { styleTag: "streetwear" },
      });
      assert.equal(resMatch.length, 2);
    },
  );

  // --- Date Validation & Expiry on Publish Tests ---
  await t.test(
    "Date Validation on Create: rejects endsAt in the past",
    async () => {
      const service = createCampaignService(createMockRepo());
      const pastEnd = new Date(Date.now() - 3600000);
      const pastStart = new Date(Date.now() - 7200000);

      await assert.rejects(
        () =>
          service.createDraft({
            user: marketingUser,
            input: {
              code: "PAST_END",
              name: "Past Campaign",
              discountType: "FIXED",
              discountValue: 10,
              startsAt: pastStart.toISOString(),
              endsAt: pastEnd.toISOString(),
            },
          }),
        (err) => {
          assert.equal(err.status, 400);
          assert.match(
            err.message,
            /ไม่สามารถกำหนดช่วงเวลาที่สิ้นสุดไปแล้วได้|วันเวลาสิ้นสุดต้องอยู่ในอนาคต/,
          );
          return true;
        },
      );
    },
  );

  await t.test(
    "Date Validation on Create: rejects startsAt in the past without reason",
    async () => {
      const service = createCampaignService(createMockRepo());
      const pastStart = new Date(Date.now() - 3600000);

      await assert.rejects(
        () =>
          service.createDraft({
            user: marketingUser,
            input: {
              code: "PAST_START",
              name: "Past Start Campaign",
              discountType: "FIXED",
              discountValue: 10,
              startsAt: pastStart.toISOString(),
              endsAt: futureEnd.toISOString(),
            },
          }),
        (err) => {
          assert.equal(err.status, 400);
          assert.match(
            err.message,
            /ไม่สามารถกำหนดวันเวลาเริ่มต้นย้อนหลังในอดีตได้/,
          );
          return true;
        },
      );
    },
  );

  await t.test(
    "Date Validation on Update: rejects changing endsAt to the past",
    async () => {
      const repo = createMockRepo({
        findById: async (id) => ({
          id,
          code: "UPDATE_END",
          name: "Update End Camp",
          status: "draft",
          discountType: "FIXED",
          discountValue: 20,
          startsAt: futureStart,
          endsAt: futureEnd,
        }),
      });
      const service = createCampaignService(repo);

      await assert.rejects(
        () =>
          service.updateDraft({
            user: marketingUser,
            campaignId: "update-end",
            input: {
              endsAt: new Date(Date.now() - 1000).toISOString(),
            },
          }),
        (err) => {
          assert.equal(err.status, 400);
          assert.match(
            err.message,
            /ไม่สามารถกำหนดช่วงเวลาที่สิ้นสุดไปแล้วได้|วันเวลาสิ้นสุดต้องอยู่ในอนาคต/,
          );
          return true;
        },
      );
    },
  );

  await t.test(
    "Date Validation on Publish: rejects campaign whose endsAt is expired",
    async () => {
      const repo = createMockRepo({
        findById: async (id) => ({
          id,
          code: "EXPIRED_PUB",
          name: "Expired Pub",
          status: "approved",
          discountType: "PERCENT",
          discountValue: 10,
          startsAt: new Date(Date.now() - 7200000),
          endsAt: new Date(Date.now() - 1000),
        }),
      });
      const service = createCampaignService(repo);

      await assert.rejects(
        () =>
          service.publishCampaign({
            user: marketingUser,
            campaignId: "expired-pub",
          }),
        (err) => {
          assert.equal(err.status, 400);
          assert.match(
            err.message,
            /ไม่สามารถเผยแพร่แคมเปญได้เนื่องจากแคมเปญหมดอายุแล้ว/,
          );
          return true;
        },
      );
    },
  );

  await t.test(
    "Publish after startsAt but before endsAt: starts using immediately",
    async () => {
      let updatedStatus = null;
      const repo = createMockRepo({
        findById: async (id) => ({
          id,
          code: "MID_FLIGHT",
          name: "Mid Flight Campaign",
          status: "approved",
          discountType: "PERCENT",
          discountValue: 15,
          startsAt: new Date(Date.now() - 3600000),
          endsAt: futureEnd,
        }),
        updateCampaign: async (id, data) => {
          updatedStatus = data.status;
          return { id, ...data };
        },
      });
      const service = createCampaignService(repo);

      const pubResult = await service.publishCampaign({
        user: marketingUser,
        campaignId: "mid-flight",
      });

      assert.equal(pubResult.status, "published");
      assert.equal(updatedStatus, "published");
    },
  );

  // --- Budget Enforcement Tests (Below / Equal / Exceeding Threshold) ---
  await t.test(
    "Budget Enforcement: claim succeeds when spentBudget is below budget ceiling",
    async () => {
      const repo = createMockRepo({
        findById: async (id) => ({
          id,
          code: "BUDGET_OK",
          name: "Budget Below Ceiling",
          status: "published",
          discountType: "PERCENT",
          discountValue: 10,
          budget: 5000,
          spentBudget: 2000,
          startsAt: new Date(Date.now() - 1000),
          endsAt: futureEnd,
        }),
      });
      const service = createCampaignService(repo);

      const voucher = await service.claimVoucher({
        user: buyerUser,
        campaignId: "budget-ok",
      });
      assert.ok(voucher);
      assert.equal(voucher.status, "CLAIMED");
    },
  );

  await t.test(
    "Budget Enforcement: claim, applicable, and quote-and-hold fail when spentBudget reaches budget ceiling",
    async () => {
      const repo = createMockRepo({
        findById: async (id) => ({
          id,
          code: "BUDGET_REACHED",
          name: "Budget At Ceiling",
          status: "published",
          discountType: "PERCENT",
          discountValue: 10,
          budget: 5000,
          spentBudget: 5000,
          startsAt: new Date(Date.now() - 1000),
          endsAt: futureEnd,
        }),
        listUserVouchers: async () => [
          {
            id: "v-1",
            campaign: {
              id: "budget-reached",
              status: "published",
              budget: 5000,
              spentBudget: 5000,
              startsAt: new Date(Date.now() - 1000),
              endsAt: futureEnd,
              minOrderPrice: 0,
              discountType: "PERCENT",
              discountValue: 10,
            },
          },
        ],
      });
      const service = createCampaignService(repo);

      // Claim should fail with 409
      await assert.rejects(
        () =>
          service.claimVoucher({
            user: buyerUser,
            campaignId: "budget-reached",
          }),
        (err) => {
          assert.equal(err.status, 409);
          assert.match(err.message, /งบประมาณแคมเปญถูกใช้เต็มจำนวนแล้ว/);
          return true;
        },
      );

      // Applicable vouchers should exclude this campaign
      const applicable = await service.getApplicableVouchers({
        user: buyerUser,
        price: 500,
      });
      assert.equal(applicable.length, 0);

      // Quote and hold should fail
      await assert.rejects(
        () =>
          service.quoteAndHold({
            campaignId: "budget-reached",
            userId: buyerUser.id,
            orderId: "ord-1",
            productId: "prod-1",
          }),
        (err) => {
          assert.equal(err.status, 400);
          return true;
        },
      );
    },
  );

  await t.test(
    "Budget Enforcement: claim fails when spentBudget exceeds budget ceiling",
    async () => {
      const repo = createMockRepo({
        findById: async (id) => ({
          id,
          code: "BUDGET_OVER",
          name: "Budget Exceeded",
          status: "published",
          discountType: "PERCENT",
          discountValue: 10,
          budget: 5000,
          spentBudget: 5200,
          startsAt: new Date(Date.now() - 1000),
          endsAt: futureEnd,
        }),
      });
      const service = createCampaignService(repo);

      await assert.rejects(
        () =>
          service.claimVoucher({
            user: buyerUser,
            campaignId: "budget-over",
          }),
        (err) => {
          assert.equal(err.status, 409);
          assert.match(err.message, /งบประมาณแคมเปญถูกใช้เต็มจำนวนแล้ว/);
          return true;
        },
      );
    },
  );

  // --- Idempotency & Budget Concurrency Tests ---
  await t.test(
    "Idempotency: duplicate attribution event does not increment spentBudget twice",
    async () => {
      const campaignStore = {
        id: "camp-idem",
        budget: 1000,
        spentBudget: 0,
        status: "published",
      };

      const {
        createCampaignMetricsService,
      } = require("../src/features/campaigns/campaignMetrics");
      const metricsService = createCampaignMetricsService(
        {
          campaign: {
            findUnique: async () => campaignStore,
            update: async ({ data }) => {
              if (data.spentBudget?.increment) {
                campaignStore.spentBudget += data.spentBudget.increment;
              }
              if (data.status) {
                campaignStore.status = data.status;
              }
              return campaignStore;
            },
          },
        },
        { isTestAdapter: true },
      );

      const event = {
        eventId: "evt-idem-001",
        orderId: "ord-idem-001",
        campaignId: "camp-idem",
        grossAmount: 1000,
        discountAmount: 200,
        netAmount: 800,
      };

      // First delivery: increments budget
      const firstRes = await metricsService.recordOrderCompletedEvent(event);
      assert.equal(firstRes.recorded, true);
      assert.equal(campaignStore.spentBudget, 200);

      // Duplicate delivery retry: deduplicates and DOES NOT increment budget again
      const retryRes = await metricsService.recordOrderCompletedEvent(event);
      assert.equal(retryRes.recorded, true);
      assert.equal(retryRes.deduplicated, true);
      assert.equal(
        campaignStore.spentBudget,
        200,
        "spentBudget must remain 200 after retry",
      );
    },
  );

  await t.test(
    "Concurrency & Budget Reached: transitions campaign to ended when cumulative discount reaches ceiling",
    async () => {
      const campaignStore = {
        id: "camp-ceiling",
        budget: 500,
        spentBudget: 0,
        status: "published",
      };

      let expiredVouchersCount = 0;
      const {
        createCampaignMetricsService,
      } = require("../src/features/campaigns/campaignMetrics");
      const metricsService = createCampaignMetricsService(
        {
          campaign: {
            findUnique: async () => campaignStore,
            update: async ({ data }) => {
              if (data.spentBudget?.increment) {
                campaignStore.spentBudget += data.spentBudget.increment;
              }
              if (data.status) {
                campaignStore.status = data.status;
              }
              return campaignStore;
            },
          },
          userVoucher: {
            updateMany: async ({ data }) => {
              if (data.status === "EXPIRED") {
                expiredVouchersCount += 5;
              }
              return { count: 5 };
            },
          },
        },
        { isTestAdapter: true },
      );

      // Concurrently deliver orders summing to over budget ceiling: 200 + 200 + 200 = 600 (> 500)
      const events = [
        {
          eventId: "evt-conc-1",
          orderId: "ord-conc-1",
          campaignId: "camp-ceiling",
          discountAmount: 200,
          grossAmount: 500,
          netAmount: 300,
        },
        {
          eventId: "evt-conc-2",
          orderId: "ord-conc-2",
          campaignId: "camp-ceiling",
          discountAmount: 200,
          grossAmount: 500,
          netAmount: 300,
        },
        {
          eventId: "evt-conc-3",
          orderId: "ord-conc-3",
          campaignId: "camp-ceiling",
          discountAmount: 200,
          grossAmount: 500,
          netAmount: 300,
        },
      ];

      await Promise.all(
        events.map((e) => metricsService.recordOrderCompletedEvent(e)),
      );

      assert.equal(campaignStore.spentBudget, 600);
      assert.equal(
        campaignStore.status,
        "ended",
        "Campaign must transition to ended when budget reached",
      );
      assert.ok(
        expiredVouchersCount > 0,
        "Claimed vouchers must be expired when campaign ends",
      );
    },
  );
});
