const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createCampaignService,
} = require("../src/features/campaigns/campaignService");

const approvedCampaign = {
  id: "campaign-targeted",
  code: "NIKEHIGH",
  name: "Nike High Intent",
  status: "approved",
  discountType: "PERCENT",
  discountValue: 15,
  minOrderPrice: 0,
  budget: 10000,
  spentBudget: 0,
  reservedBudget: 0,
  startsAt: new Date(Date.now() + 60_000),
  endsAt: new Date(Date.now() + 86_400_000),
  audienceCriteria: {
    brand: "nike",
    minScore: 15,
    maxScore: 33,
    from: "2026-10-01T00:00:00.000Z",
    to: "2026-10-18T00:00:00.000Z",
  },
};

test("publishing a targeted campaign snapshots rights, audit, and notifications", async () => {
  let savedAudience = null;
  let savedUpdate = null;
  let savedAudit = null;
  let notification = null;
  let campaignLockCalls = 0;
  const repository = {
    findById: async () => approvedCampaign,
    $queryRaw: async () => {
      campaignLockCalls += 1;
    },
    updateCampaign: async (_id, data) => {
      savedUpdate = data;
      return { ...approvedCampaign, ...data };
    },
    transaction: async (work) => work(repository),
    marketingAuditLog: {
      create: async ({ data }) => {
        savedAudit = data;
        return data;
      },
    },
  };
  const audienceService = {
    snapshot: async () => ({
      criteria: approvedCampaign.audienceCriteria,
      members: [
        { userId: "buyer-a", score: 26 },
        { userId: "buyer-b", score: 18 },
      ],
    }),
  };
  const audienceRepository = {
    replaceCampaignAudience: async (campaignId, members, { tx }) => {
      savedAudience = { campaignId, members, tx };
    },
  };
  const chatClient = {
    notifyCampaignAudience: async (payload) => {
      notification = payload;
      return { deliveredCount: 2, failedCount: 0, warnings: [] };
    },
  };
  const service = createCampaignService(repository, null, {
    audienceService,
    audienceRepository,
    chatClient,
  });

  const result = await service.publishCampaign({
    user: { id: "marketing-1", role: "MARKETING" },
    campaignId: approvedCampaign.id,
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(result.status, "published");
  assert.equal(campaignLockCalls, 1);
  assert.deepEqual(savedAudience.members, [
    { userId: "buyer-a", score: 26 },
    { userId: "buyer-b", score: 18 },
  ]);
  assert.equal(savedAudience.tx, repository);
  assert.ok(savedUpdate.audienceSnapshotAt instanceof Date);
  assert.equal(savedAudit.action, "CAMPAIGN_PUBLISH");
  assert.equal(savedAudit.metadata.audienceSize, 2);
  assert.deepEqual(notification.userIds, ["buyer-a", "buyer-b"]);
  assert.equal(result.notifiedAudienceCount, 2);
  assert.deepEqual(result.notificationWarnings, []);
});

test("publishing rejects a stale audience snapshot when targeting changes before the row lock", async () => {
  let reads = 0;
  let updateCalls = 0;
  const repository = {
    findById: async () => {
      reads += 1;
      return reads === 1
        ? approvedCampaign
        : {
            ...approvedCampaign,
            audienceCriteria: {
              ...approvedCampaign.audienceCriteria,
              minScore: 25,
            },
          };
    },
    updateCampaign: async () => {
      updateCalls += 1;
      throw new Error("must not publish with a stale audience snapshot");
    },
    transaction: async (work) => work(repository),
  };
  const audienceService = {
    normalizeAudienceCriteria: (criteria) => criteria,
    snapshot: async () => ({
      criteria: approvedCampaign.audienceCriteria,
      members: [{ userId: "buyer-a", score: 26 }],
    }),
  };
  const service = createCampaignService(repository, null, {
    audienceService,
    audienceRepository: {},
    chatClient: {},
  });

  await assert.rejects(
    service.publishCampaign({
      user: { id: "marketing-1", role: "MARKETING" },
      campaignId: approvedCampaign.id,
    }),
    (error) => error.status === 409 && error.message.includes("ถูกแก้ไข"),
  );
  assert.equal(updateCalls, 0);
});

test("public campaign list checks saved audience membership instead of current score", async () => {
  const repository = {
    listAvailableCampaigns: async () => [
      { ...approvedCampaign, status: "published" },
      {
        ...approvedCampaign,
        id: "campaign-universal",
        status: "published",
        audienceCriteria: null,
        targetSegment: null,
      },
    ],
  };
  const service = createCampaignService(repository, null, {
    audienceRepository: {
      eligibleCampaignIds: async () => new Set([approvedCampaign.id]),
    },
    chatClient: {},
  });

  const result = await service.listAvailablePublicCampaigns({
    userId: "buyer-a",
    profile: {},
  });

  assert.deepEqual(
    result.map((campaign) => campaign.id),
    [approvedCampaign.id, "campaign-universal"],
  );
});
