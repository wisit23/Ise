const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";
process.env.INTERNAL_SERVICE_TOKEN ||= "test-internal-token";
if (process.env.DATABASE_URL_PRODUCT) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_PRODUCT;
}

const { signAccessToken } = require("@reloop/shared");
const prisma = require("../src/models/prismaClient");
const app = require("../src/app");

// Mock live session validation for token fixtures
app.locals.validateAccessSession = async () => {};

const buyerToken = signAccessToken({
  sub: "audit-test-buyer-01",
  role: "BUYER",
  displayName: "Audit Buyer Tester",
});

const sellerToken = signAccessToken({
  sub: "audit-test-seller-01",
  role: "SELLER",
  displayName: "Audit Seller Tester",
});

const marketingToken = signAccessToken({
  sub: "audit-test-mkt-01",
  role: "MARKETING",
  displayName: "ฝ่ายการตลาด ผู้ตรวจสอบ",
});

const adminToken = signAccessToken({
  sub: "audit-test-admin-01",
  role: "ADMIN",
  displayName: "Admin Auditor",
});

const buyerWithAuditPermToken = signAccessToken({
  sub: "audit-test-buyer-perm-01",
  role: "BUYER",
  permissions: ["audit:read:marketing"],
});

const buyerWithAnalyticsPermToken = signAccessToken({
  sub: "audit-test-buyer-perm-02",
  role: "BUYER",
  permissions: ["analytics:read:marketing"],
});

const sellerWithAuditPermToken = signAccessToken({
  sub: "audit-test-seller-perm-01",
  role: "SELLER",
  permissions: ["audit:read:marketing"],
});

async function databaseIsReachable() {
  if (!process.env.DATABASE_URL) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

test("Marketing Audit Trail Integration Suite (PostgreSQL)", async (t) => {
  if (!(await databaseIsReachable())) {
    const message = "DATABASE_URL not set or database unreachable";
    if (process.env.REQUIRE_INTEGRATION === "1") {
      throw new Error(`REQUIRE_INTEGRATION=1 but ${message}`);
    }
    t.skip(message);
    return;
  }

  const runId = `aud-${Date.now()}`;
  const createdCampaignIds = [];
  const createdArticleIds = [];
  const createdProductIds = [];
  const createdAuctionIds = [];
  const createdRoundIds = [];
  const createdAuditLogIds = [];

  t.after(async () => {
    // Clean up created entities and audit logs using specific IDs and runId scoping
    const validAuditLogIds = createdAuditLogIds.filter(Boolean);
    if (validAuditLogIds.length > 0) {
      await prisma.marketingAuditLog.deleteMany({
        where: { id: { in: validAuditLogIds } },
      });
    }
    await prisma.marketingAuditLog.deleteMany({
      where: {
        OR: [
          { entityId: { contains: runId } },
          { idempotencyKey: { contains: runId } },
        ],
      },
    });

    const validCampaignIds = createdCampaignIds.filter(Boolean);
    if (validCampaignIds.length > 0) {
      await prisma.userVoucher.deleteMany({
        where: { campaignId: { in: validCampaignIds } },
      });
      await prisma.campaign.deleteMany({
        where: { id: { in: validCampaignIds } },
      });
    }
    const validArticleIds = createdArticleIds.filter(Boolean);
    if (validArticleIds.length > 0) {
      await prisma.article.deleteMany({
        where: { id: { in: validArticleIds } },
      });
    }
    const validAuctionIds = createdAuctionIds.filter(Boolean);
    if (validAuctionIds.length > 0) {
      await prisma.auctionItem.deleteMany({
        where: { id: { in: validAuctionIds } },
      });
    }
    const validRoundIds = createdRoundIds.filter(Boolean);
    if (validRoundIds.length > 0) {
      await prisma.auctionRound.deleteMany({
        where: { id: { in: validRoundIds } },
      });
    }
    const validProductIds = createdProductIds.filter(Boolean);
    if (validProductIds.length > 0) {
      await prisma.product.deleteMany({
        where: { id: { in: validProductIds } },
      });
    }

    try {
      const auctionCloseQueue = require("../src/jobs/auctionCloseQueue");
      await auctionCloseQueue.closeQueue();
    } catch {
      // ignore
    }

    try {
      await prisma.$disconnect();
    } catch {
      // ignore
    }
  });

  // 1. RBAC & Anti-spoofing tests (Marketing-only per MKT-DEC-014)
  await t.test(
    "RBAC: Marketing-only authorization, 401 unauthenticated, 403 for Buyer, Seller, Admin, permission bypass prevention, and anti-spoofing",
    async () => {
      // Missing token -> 401
      const noAuth = await request(app).get("/marketing/audit-logs");
      assert.equal(noAuth.status, 401);

      // BUYER -> 403
      const buyerRes = await request(app)
        .get("/marketing/audit-logs")
        .set("Authorization", `Bearer ${buyerToken}`);
      assert.equal(buyerRes.status, 403);

      // SELLER -> 403
      const sellerRes = await request(app)
        .get("/marketing/audit-logs")
        .set("Authorization", `Bearer ${sellerToken}`);
      assert.equal(sellerRes.status, 403);

      // ADMIN -> 403 (MKT-DEC-014 Admin Decoupling)
      const adminRes = await request(app)
        .get("/marketing/audit-logs")
        .set("Authorization", `Bearer ${adminToken}`);
      assert.equal(adminRes.status, 403);

      // BUYER with audit:read:marketing permission -> 403 (permissions cannot bypass role check)
      const buyerAuditPermRes = await request(app)
        .get("/marketing/audit-logs")
        .set("Authorization", `Bearer ${buyerWithAuditPermToken}`);
      assert.equal(buyerAuditPermRes.status, 403);

      // BUYER with analytics:read:marketing permission -> 403
      const buyerAnalyticsPermRes = await request(app)
        .get("/marketing/audit-logs")
        .set("Authorization", `Bearer ${buyerWithAnalyticsPermToken}`);
      assert.equal(buyerAnalyticsPermRes.status, 403);

      // SELLER with audit:read:marketing permission -> 403
      const sellerAuditPermRes = await request(app)
        .get("/marketing/audit-logs")
        .set("Authorization", `Bearer ${sellerWithAuditPermToken}`);
      assert.equal(sellerAuditPermRes.status, 403);

      // Anti-spoofing: BUYER token with spoofed x-user-role header -> 403
      const spoofedRes = await request(app)
        .get("/marketing/audit-logs")
        .set("Authorization", `Bearer ${buyerToken}`)
        .set("x-user-role", "MARKETING");
      assert.equal(spoofedRes.status, 403);

      // MARKETING -> 200
      const mktRes = await request(app)
        .get("/marketing/audit-logs")
        .set("Authorization", `Bearer ${marketingToken}`);
      assert.equal(mktRes.status, 200);
      assert.ok(Array.isArray(mktRes.body.items));

      // Gateway route (/api/products/marketing/audit-logs) -> 200
      const gatewayRes = await request(app)
        .get("/api/products/marketing/audit-logs")
        .set("Authorization", `Bearer ${marketingToken}`);
      assert.equal(gatewayRes.status, 200);
      assert.ok(Array.isArray(gatewayRes.body.items));
    },
  );

  // 2. Read-only API contract
  await t.test(
    "Read-only contract: Client write/update/delete endpoints do not exist",
    async () => {
      const postRes = await request(app)
        .post("/marketing/audit-logs")
        .set("Authorization", `Bearer ${marketingToken}`)
        .send({ action: "CAMPAIGN_CREATE" });
      assert.ok(postRes.status === 404 || postRes.status === 405);

      const putRes = await request(app)
        .put("/marketing/audit-logs/some-id")
        .set("Authorization", `Bearer ${marketingToken}`)
        .send({ action: "CAMPAIGN_CREATE" });
      assert.ok(putRes.status === 404 || putRes.status === 405);

      const deleteRes = await request(app)
        .delete("/marketing/audit-logs/some-id")
        .set("Authorization", `Bearer ${marketingToken}`);
      assert.ok(deleteRes.status === 404 || deleteRes.status === 405);
    },
  );

  // 3. Campaign lifecycle audit trail: CREATE, UPDATE, SUBMIT, APPROVE, REJECT, PUBLISH, END
  await t.test(
    "Campaign lifecycle: Atomic mutations for CREATE, UPDATE, SUBMIT, APPROVE, REJECT, PUBLISH, END",
    async () => {
      const campaignCode1 = `CAMP_${runId}_1`.toUpperCase();

      // Step A: Create campaign draft -> CAMPAIGN_CREATE
      const createRes = await request(app)
        .post("/campaigns")
        .set("Authorization", `Bearer ${marketingToken}`)
        .send({
          code: campaignCode1,
          name: "Audit Test Campaign",
          discountType: "FIXED",
          discountValue: 100,
          startsAt: new Date(Date.now() + 86400000).toISOString(),
          endsAt: new Date(Date.now() + 864000000).toISOString(),
        });
      assert.equal(
        createRes.status,
        201,
        `Failed to create campaign: ${JSON.stringify(createRes.body)}`,
      );
      const campaignId1 = createRes.body.id;
      createdCampaignIds.push(campaignId1);

      const createAudit = await prisma.marketingAuditLog.findFirst({
        where: {
          entityType: "CAMPAIGN",
          entityId: campaignId1,
          action: "CAMPAIGN_CREATE",
        },
      });
      assert.ok(createAudit, "CAMPAIGN_CREATE audit log must exist in DB");
      assert.equal(createAudit.actorId, "audit-test-mkt-01");
      assert.equal(createAudit.actorRole, "MARKETING");
      assert.equal(createAudit.previousState, null);
      assert.equal(createAudit.newState.code, campaignCode1);
      createdAuditLogIds.push(createAudit.id);

      // Step B: Update campaign draft -> CAMPAIGN_UPDATE
      const updateRes = await request(app)
        .patch(`/campaigns/${campaignId1}`)
        .set("Authorization", `Bearer ${marketingToken}`)
        .send({
          name: "Audit Test Campaign Updated",
        });
      assert.equal(
        updateRes.status,
        200,
        `Update campaign failed: ${JSON.stringify(updateRes.body)}`,
      );

      const updateAudit = await prisma.marketingAuditLog.findFirst({
        where: {
          entityType: "CAMPAIGN",
          entityId: campaignId1,
          action: "CAMPAIGN_UPDATE",
        },
      });
      assert.ok(updateAudit, "CAMPAIGN_UPDATE audit log must exist in DB");
      assert.equal(updateAudit.previousState.name, "Audit Test Campaign");
      assert.equal(updateAudit.newState.name, "Audit Test Campaign Updated");
      createdAuditLogIds.push(updateAudit.id);

      // Step C: Submit campaign -> CAMPAIGN_SUBMIT
      const submitRes = await request(app)
        .post(`/campaigns/${campaignId1}/submit`)
        .set("Authorization", `Bearer ${marketingToken}`);
      assert.equal(submitRes.status, 200);

      const submitAudit = await prisma.marketingAuditLog.findFirst({
        where: {
          entityType: "CAMPAIGN",
          entityId: campaignId1,
          action: "CAMPAIGN_SUBMIT",
        },
      });
      assert.ok(submitAudit, "CAMPAIGN_SUBMIT audit log must exist");
      assert.equal(submitAudit.newState.status, "pending_approval");
      createdAuditLogIds.push(submitAudit.id);

      // Step D: Approve campaign -> CAMPAIGN_APPROVE
      const approveRes = await request(app)
        .post(`/campaigns/${campaignId1}/approve`)
        .set("Authorization", `Bearer ${marketingToken}`);
      assert.equal(approveRes.status, 200);

      const approveAudit = await prisma.marketingAuditLog.findFirst({
        where: {
          entityType: "CAMPAIGN",
          entityId: campaignId1,
          action: "CAMPAIGN_APPROVE",
        },
      });
      assert.ok(approveAudit, "CAMPAIGN_APPROVE audit log must exist");
      assert.equal(approveAudit.actorRole, "MARKETING");
      createdAuditLogIds.push(approveAudit.id);

      // Step E: Publish campaign -> CAMPAIGN_PUBLISH
      const publishRes = await request(app)
        .post(`/campaigns/${campaignId1}/publish`)
        .set("Authorization", `Bearer ${marketingToken}`);
      assert.equal(publishRes.status, 200);

      const publishAudit = await prisma.marketingAuditLog.findFirst({
        where: {
          entityType: "CAMPAIGN",
          entityId: campaignId1,
          action: "CAMPAIGN_PUBLISH",
        },
      });
      assert.ok(publishAudit, "CAMPAIGN_PUBLISH audit log must exist");
      assert.equal(publishAudit.newState.status, "published");
      createdAuditLogIds.push(publishAudit.id);

      // Step F: End campaign -> CAMPAIGN_END
      const endRes = await request(app)
        .post(`/campaigns/${campaignId1}/end`)
        .set("Authorization", `Bearer ${marketingToken}`);
      assert.equal(endRes.status, 200);

      const endAudit = await prisma.marketingAuditLog.findFirst({
        where: {
          entityType: "CAMPAIGN",
          entityId: campaignId1,
          action: "CAMPAIGN_END",
        },
      });
      assert.ok(endAudit, "CAMPAIGN_END audit log must exist");
      assert.equal(endAudit.newState.status, "ended");
      createdAuditLogIds.push(endAudit.id);

      // Step G: Create a second campaign to test CAMPAIGN_REJECT
      const campaignCode2 = `CAMP_${runId}_2`.toUpperCase();
      const create2Res = await request(app)
        .post("/campaigns")
        .set("Authorization", `Bearer ${marketingToken}`)
        .send({
          code: campaignCode2,
          name: "Reject Test Campaign",
          discountType: "FIXED",
          discountValue: 50,
          startsAt: new Date(Date.now() + 86400000).toISOString(),
          endsAt: new Date(Date.now() + 864000000).toISOString(),
        });
      assert.equal(create2Res.status, 201);
      const campaignId2 = create2Res.body.id;
      createdCampaignIds.push(campaignId2);

      await request(app)
        .post(`/campaigns/${campaignId2}/submit`)
        .set("Authorization", `Bearer ${marketingToken}`);

      // Reject campaign -> CAMPAIGN_REJECT
      const rejectRes = await request(app)
        .post(`/campaigns/${campaignId2}/reject`)
        .set("Authorization", `Bearer ${marketingToken}`)
        .send({ rejectionReason: "Budget exceeded" });
      assert.equal(rejectRes.status, 200);

      const rejectAudit = await prisma.marketingAuditLog.findFirst({
        where: {
          entityType: "CAMPAIGN",
          entityId: campaignId2,
          action: "CAMPAIGN_REJECT",
        },
      });
      assert.ok(rejectAudit, "CAMPAIGN_REJECT audit log must exist");
      assert.equal(rejectAudit.actorRole, "MARKETING");
      assert.equal(rejectAudit.newState.status, "rejected");
      createdAuditLogIds.push(rejectAudit.id);
    },
  );

  // 4. Automatic actions with SYSTEM actor & idempotencyKey deduplication
  await t.test(
    "Automatic SYSTEM actions: CAMPAIGN_END and AUCTION_ITEM_CLOSE with deterministic idempotencyKey",
    async () => {
      // Step A: Automatic CAMPAIGN_END via autoExpireCampaigns
      const expiredCampaign = await prisma.campaign.create({
        data: {
          code: `AUTO_EXP_${runId}`.toUpperCase(),
          name: "Auto Expire Campaign",
          discountType: "FIXED",
          discountValue: 100,
          startsAt: new Date(Date.now() - 7200000),
          endsAt: new Date(Date.now() - 1000), // Expired 1s ago
          status: "published",
          createdById: "audit-test-mkt-01",
        },
      });
      createdCampaignIds.push(expiredCampaign.id);

      const campaignRepo = require("../src/features/campaigns/campaignRepository");
      const expiredCount = await campaignRepo.autoExpireCampaigns();
      assert.ok(
        expiredCount >= 1,
        "autoExpireCampaigns must expire the overdue campaign",
      );

      const autoEndAudit = await prisma.marketingAuditLog.findUnique({
        where: { idempotencyKey: `CAMPAIGN_END:${expiredCampaign.id}` },
      });
      assert.ok(
        autoEndAudit,
        "CAMPAIGN_END audit log must exist with idempotencyKey",
      );
      assert.equal(autoEndAudit.actorId, "SYSTEM");
      assert.equal(autoEndAudit.actorRole, "SYSTEM");
      createdAuditLogIds.push(autoEndAudit.id);

      // Retry autoExpireCampaigns
      await campaignRepo.autoExpireCampaigns();
      const countAfterRetry = await prisma.marketingAuditLog.count({
        where: { idempotencyKey: `CAMPAIGN_END:${expiredCampaign.id}` },
      });
      assert.equal(
        countAfterRetry,
        1,
        "Must NOT create duplicate audit log on autoExpire retry",
      );

      // Step B: Automatic AUCTION_ITEM_CLOSE via closeAuction
      const closeProduct = await prisma.product.create({
        data: {
          title: `Auto Close Product ${runId}`,
          price: 900,
          sellerId: "audit-test-seller-01",
          category: "apparel",
          status: "in_auction",
        },
      });
      createdProductIds.push(closeProduct.id);

      const closeAuctionItem = await prisma.auctionItem.create({
        data: {
          productId: closeProduct.id,
          sellerId: "audit-test-seller-01",
          startingPrice: 300,
          bidIncrement: 30,
          status: "open",
          scheduledStartAt: new Date(Date.now() - 7200000),
          scheduledEndAt: new Date(Date.now() - 1000),
        },
      });
      createdAuctionIds.push(closeAuctionItem.id);

      const auctionService = require("../src/features/auctions/auctionService");
      await auctionService.closeAuction(closeAuctionItem.id);

      const autoCloseAudit = await prisma.marketingAuditLog.findUnique({
        where: { idempotencyKey: `AUCTION_ITEM_CLOSE:${closeAuctionItem.id}` },
      });
      assert.ok(
        autoCloseAudit,
        "AUCTION_ITEM_CLOSE audit log must exist with idempotencyKey",
      );
      assert.equal(autoCloseAudit.actorId, "SYSTEM");
      assert.equal(autoCloseAudit.actorRole, "SYSTEM");
      createdAuditLogIds.push(autoCloseAudit.id);

      // Retry closeAuction
      await auctionService.closeAuction(closeAuctionItem.id);
      const closeCountAfterRetry = await prisma.marketingAuditLog.count({
        where: { idempotencyKey: `AUCTION_ITEM_CLOSE:${closeAuctionItem.id}` },
      });
      assert.equal(
        closeCountAfterRetry,
        1,
        "Must NOT create duplicate audit log on closeAuction retry",
      );
    },
  );

  // 5. Concurrent retry deduplication with Promise.all and no 25P02 error
  await t.test(
    "Concurrent retry deduplication: Promise.all creates no duplicate audit and no 25P02 error",
    async () => {
      const auditRepo = require("../src/features/audit/marketingAuditRepository");

      // Concurrency test for CAMPAIGN_END
      const testCampId = `concurrent-camp-${runId}`;
      const campPromises = Array.from({ length: 5 }, () =>
        prisma.$transaction(async (tx) => {
          return auditRepo.recordAudit(
            {
              actorId: "SYSTEM",
              actorRole: "SYSTEM",
              action: "CAMPAIGN_END",
              entityType: "CAMPAIGN",
              entityId: testCampId,
              idempotencyKey: `CAMPAIGN_END:${testCampId}`,
            },
            { tx },
          );
        }),
      );

      const campResults = await Promise.all(campPromises);
      assert.equal(campResults.length, 5);
      for (const res of campResults) {
        assert.ok(res.id);
        assert.equal(res.idempotencyKey, `CAMPAIGN_END:${testCampId}`);
      }

      const campAuditCount = await prisma.marketingAuditLog.count({
        where: { idempotencyKey: `CAMPAIGN_END:${testCampId}` },
      });
      assert.equal(
        campAuditCount,
        1,
        "Concurrent CAMPAIGN_END must result in exactly 1 audit record",
      );

      // Concurrency test for AUCTION_ITEM_CLOSE
      const testAuctionId = `concurrent-auc-${runId}`;
      const auctionPromises = Array.from({ length: 5 }, () =>
        prisma.$transaction(async (tx) => {
          return auditRepo.recordAudit(
            {
              actorId: "SYSTEM",
              actorRole: "SYSTEM",
              action: "AUCTION_ITEM_CLOSE",
              entityType: "AUCTION_ITEM",
              entityId: testAuctionId,
              idempotencyKey: `AUCTION_ITEM_CLOSE:${testAuctionId}`,
            },
            { tx },
          );
        }),
      );

      const auctionResults = await Promise.all(auctionPromises);
      assert.equal(auctionResults.length, 5);
      for (const res of auctionResults) {
        assert.ok(res.id);
        assert.equal(res.idempotencyKey, `AUCTION_ITEM_CLOSE:${testAuctionId}`);
      }

      const auctionAuditCount = await prisma.marketingAuditLog.count({
        where: { idempotencyKey: `AUCTION_ITEM_CLOSE:${testAuctionId}` },
      });
      assert.equal(
        auctionAuditCount,
        1,
        "Concurrent AUCTION_ITEM_CLOSE must result in exactly 1 audit record",
      );
    },
  );

  // 6. Transaction atomicity: Audit failure rolls back business mutation, failed mutation creates no audit
  await t.test(
    "Transaction atomicity: Audit failure rolls back business mutation, failed mutation creates no audit",
    async () => {
      const doomedCode = `DOOMED_${runId}`.toUpperCase();

      // Verify audit insert failure rolls back business mutation
      await assert.rejects(
        () =>
          prisma.$transaction(async (tx) => {
            await tx.campaign.create({
              data: {
                code: doomedCode,
                name: "Doomed Campaign",
                discountType: "FIXED",
                discountValue: 100,
                startsAt: new Date(Date.now() + 86400000),
                endsAt: new Date(Date.now() + 864000000),
                status: "draft",
                createdById: "audit-test-mkt-01",
              },
            });

            // Simulate audit insert failure inside the transaction
            const error = new Error("Simulated audit disk failure");
            error.code = "AUDIT_FAILURE";
            throw error;
          }),
        /Simulated audit disk failure/,
      );

      const doomedCampaign = await prisma.campaign.findUnique({
        where: { code: doomedCode },
      });
      assert.equal(
        doomedCampaign,
        null,
        "Business mutation must roll back when audit insert fails",
      );

      // Verify failed business mutation does not write audit log
      const failRes = await request(app)
        .post("/campaigns/non-existent-id-99999/end")
        .set("Authorization", `Bearer ${marketingToken}`)
        .send({ reason: "Should fail" });
      assert.equal(failRes.status, 404);

      const ghostAudit = await prisma.marketingAuditLog.findFirst({
        where: { entityId: "non-existent-id-99999" },
      });
      assert.equal(
        ghostAudit,
        null,
        "No audit log should be written on failed mutation",
      );
    },
  );

  // 7. Auction lifecycle: ROUND_CREATE, ITEM_APPROVE, ITEM_REJECT, ITEM_SCHEDULE, ITEM_CANCEL, ITEM_CLOSE
  await t.test(
    "Auction lifecycle: AUCTION_ROUND_CREATE, ITEM_APPROVE, ITEM_REJECT, ITEM_SCHEDULE, ITEM_CANCEL, ITEM_CLOSE",
    async () => {
      // Dynamic future base timestamp avoiding any collision with existing rounds
      const maxExisting = await prisma.auctionRound.aggregate({
        _max: { auctionEndsAt: true },
      });
      const baseEnd = maxExisting._max?.auctionEndsAt
        ? new Date(maxExisting._max.auctionEndsAt).getTime()
        : Date.now();
      const testBaseMs = Math.max(Date.now(), baseEnd) + 3600000;

      // Step A: Create auction round -> AUCTION_ROUND_CREATE
      const createRoundRes = await request(app)
        .post("/auctions/rounds")
        .set("Authorization", `Bearer ${marketingToken}`)
        .send({
          title: `Audit Round ${runId}`,
          submissionStartsAt: new Date(testBaseMs).toISOString(),
          submissionEndsAt: new Date(testBaseMs + 2 * 3600000).toISOString(),
          auctionStartsAt: new Date(testBaseMs + 3 * 3600000).toISOString(),
          auctionEndsAt: new Date(testBaseMs + 5 * 3600000).toISOString(),
        });
      assert.equal(
        createRoundRes.status,
        201,
        `Failed to create round: ${JSON.stringify(createRoundRes.body)}`,
      );
      const roundId = createRoundRes.body.id;
      createdRoundIds.push(roundId);

      const roundAudit = await prisma.marketingAuditLog.findFirst({
        where: {
          entityType: "AUCTION_ROUND",
          entityId: roundId,
          action: "AUCTION_ROUND_CREATE",
        },
      });
      assert.ok(roundAudit, "AUCTION_ROUND_CREATE audit log must exist");
      createdAuditLogIds.push(roundAudit.id);

      // Step B: Create a product and auction item for approve, schedule, cancel
      const testProduct1 = await prisma.product.create({
        data: {
          title: `Auction Product 1 ${runId}`,
          price: 500,
          sellerId: "audit-test-seller-01",
          category: "apparel",
          status: "available",
        },
      });
      createdProductIds.push(testProduct1.id);

      const testAuction1 = await prisma.auctionItem.create({
        data: {
          productId: testProduct1.id,
          sellerId: "audit-test-seller-01",
          startingPrice: 100,
          bidIncrement: 10,
          status: "pending_approval",
        },
      });
      createdAuctionIds.push(testAuction1.id);

      // Approve auction item -> AUCTION_ITEM_APPROVE
      const approveAuctionRes = await request(app)
        .patch(`/auctions/${testAuction1.id}/approve`)
        .set("Authorization", `Bearer ${marketingToken}`);
      assert.equal(
        approveAuctionRes.status,
        200,
        `Approve auction failed: ${JSON.stringify(approveAuctionRes.body)}`,
      );

      const approveItemAudit = await prisma.marketingAuditLog.findFirst({
        where: {
          entityType: "AUCTION_ITEM",
          entityId: testAuction1.id,
          action: "AUCTION_ITEM_APPROVE",
        },
      });
      assert.ok(approveItemAudit, "AUCTION_ITEM_APPROVE audit log must exist");
      assert.equal(approveItemAudit.actorRole, "MARKETING");
      createdAuditLogIds.push(approveItemAudit.id);

      // Schedule auction item -> AUCTION_ITEM_SCHEDULE
      const scheduleRes = await request(app)
        .patch(`/auctions/${testAuction1.id}/schedule`)
        .set("Authorization", `Bearer ${marketingToken}`)
        .send({
          startsAt: new Date(testBaseMs + 3 * 3600000).toISOString(),
          endsAt: new Date(testBaseMs + 5 * 3600000).toISOString(),
        });
      assert.equal(
        scheduleRes.status,
        200,
        `Schedule auction failed: ${JSON.stringify(scheduleRes.body)}`,
      );

      const scheduleItemAudit = await prisma.marketingAuditLog.findFirst({
        where: {
          entityType: "AUCTION_ITEM",
          entityId: testAuction1.id,
          action: "AUCTION_ITEM_SCHEDULE",
        },
      });
      assert.ok(
        scheduleItemAudit,
        "AUCTION_ITEM_SCHEDULE audit log must exist",
      );
      assert.equal(scheduleItemAudit.actorRole, "MARKETING");
      createdAuditLogIds.push(scheduleItemAudit.id);

      // Cancel auction item -> AUCTION_ITEM_CANCEL
      const cancelAuctionRes = await request(app)
        .patch(`/auctions/${testAuction1.id}/cancel`)
        .set("Authorization", `Bearer ${marketingToken}`)
        .send({ reason: "Audit test cancellation" });
      assert.equal(
        cancelAuctionRes.status,
        200,
        `Cancel auction failed: ${JSON.stringify(cancelAuctionRes.body)}`,
      );

      const cancelItemAudit = await prisma.marketingAuditLog.findFirst({
        where: {
          entityType: "AUCTION_ITEM",
          entityId: testAuction1.id,
          action: "AUCTION_ITEM_CANCEL",
        },
      });
      assert.ok(cancelItemAudit, "AUCTION_ITEM_CANCEL audit log must exist");
      assert.equal(cancelItemAudit.newState.status, "cancelled");
      createdAuditLogIds.push(cancelItemAudit.id);

      // Step C: Create a second auction item for AUCTION_ITEM_REJECT
      const testProduct2 = await prisma.product.create({
        data: {
          title: `Auction Product 2 ${runId}`,
          price: 600,
          sellerId: "audit-test-seller-01",
          category: "apparel",
          status: "available",
        },
      });
      createdProductIds.push(testProduct2.id);

      const testAuction2 = await prisma.auctionItem.create({
        data: {
          productId: testProduct2.id,
          sellerId: "audit-test-seller-01",
          startingPrice: 150,
          bidIncrement: 15,
          status: "pending_approval",
        },
      });
      createdAuctionIds.push(testAuction2.id);

      // Reject auction item -> AUCTION_ITEM_REJECT
      const rejectAuctionRes = await request(app)
        .patch(`/auctions/${testAuction2.id}/reject`)
        .set("Authorization", `Bearer ${marketingToken}`)
        .send({ reason: "Inappropriate condition" });
      assert.equal(
        rejectAuctionRes.status,
        200,
        `Reject auction failed: ${JSON.stringify(rejectAuctionRes.body)}`,
      );

      const rejectItemAudit = await prisma.marketingAuditLog.findFirst({
        where: {
          entityType: "AUCTION_ITEM",
          entityId: testAuction2.id,
          action: "AUCTION_ITEM_REJECT",
        },
      });
      assert.ok(rejectItemAudit, "AUCTION_ITEM_REJECT audit log must exist");
      assert.equal(rejectItemAudit.actorRole, "MARKETING");
      assert.equal(rejectItemAudit.newState.status, "rejected");
      createdAuditLogIds.push(rejectItemAudit.id);

      // Verify product status reverted to available
      const product2AfterReject = await prisma.product.findUnique({
        where: { id: testProduct2.id },
      });
      assert.equal(product2AfterReject.status, "available");
    },
  );

  // 8. Article lifecycle: CREATE, UPDATE, PUBLISH, ARCHIVE, DELETE
  await t.test(
    "Article lifecycle: CREATE, UPDATE, PUBLISH, ARCHIVE, DELETE audit",
    async () => {
      // Step A: Create article as draft -> ARTICLE_CREATE
      const createArticleRes = await request(app)
        .post("/articles")
        .set("Authorization", `Bearer ${marketingToken}`)
        .send({
          title: `Audit Test Article ${runId}`,
          content: "Initial draft content for audit verification",
          category: "care",
          status: "draft",
        });
      assert.equal(
        createArticleRes.status,
        201,
        `Create article failed: ${JSON.stringify(createArticleRes.body)}`,
      );
      const articleId = createArticleRes.body.article
        ? createArticleRes.body.article.id
        : createArticleRes.body.id;
      assert.ok(articleId, "Article ID must be present in response");
      createdArticleIds.push(articleId);

      const createArtAudit = await prisma.marketingAuditLog.findFirst({
        where: {
          entityType: "ARTICLE",
          entityId: articleId,
          action: "ARTICLE_CREATE",
        },
      });
      assert.ok(createArtAudit, "ARTICLE_CREATE audit log must exist");
      assert.equal(createArtAudit.actorId, "audit-test-mkt-01");
      createdAuditLogIds.push(createArtAudit.id);

      // Step B: Update article content -> ARTICLE_UPDATE
      const updateArticleRes = await request(app)
        .put(`/articles/${articleId}`)
        .set("Authorization", `Bearer ${marketingToken}`)
        .send({
          title: `Audit Test Article ${runId} - Revised`,
        });
      assert.equal(updateArticleRes.status, 200);

      const updateArtAudit = await prisma.marketingAuditLog.findFirst({
        where: {
          entityType: "ARTICLE",
          entityId: articleId,
          action: "ARTICLE_UPDATE",
        },
      });
      assert.ok(updateArtAudit, "ARTICLE_UPDATE audit log must exist");
      createdAuditLogIds.push(updateArtAudit.id);

      // Step C: Publish article -> ARTICLE_PUBLISH
      const publishArticleRes = await request(app)
        .put(`/articles/${articleId}`)
        .set("Authorization", `Bearer ${marketingToken}`)
        .send({
          status: "published",
        });
      assert.equal(publishArticleRes.status, 200);

      const publishArtAudit = await prisma.marketingAuditLog.findFirst({
        where: {
          entityType: "ARTICLE",
          entityId: articleId,
          action: "ARTICLE_PUBLISH",
        },
      });
      assert.ok(publishArtAudit, "ARTICLE_PUBLISH audit log must exist");
      createdAuditLogIds.push(publishArtAudit.id);

      // Step D: Archive article -> ARTICLE_ARCHIVE
      const archiveArticleRes = await request(app)
        .put(`/articles/${articleId}`)
        .set("Authorization", `Bearer ${marketingToken}`)
        .send({
          status: "archived",
        });
      assert.equal(archiveArticleRes.status, 200);

      const archiveArtAudit = await prisma.marketingAuditLog.findFirst({
        where: {
          entityType: "ARTICLE",
          entityId: articleId,
          action: "ARTICLE_ARCHIVE",
        },
      });
      assert.ok(archiveArtAudit, "ARTICLE_ARCHIVE audit log must exist");
      createdAuditLogIds.push(archiveArtAudit.id);

      // Step E: Delete article -> ARTICLE_DELETE (returns 204)
      const deleteArticleRes = await request(app)
        .delete(`/articles/${articleId}`)
        .set("Authorization", `Bearer ${marketingToken}`);
      assert.equal(deleteArticleRes.status, 204);

      const deleteArtAudit = await prisma.marketingAuditLog.findFirst({
        where: {
          entityType: "ARTICLE",
          entityId: articleId,
          action: "ARTICLE_DELETE",
        },
      });
      assert.ok(deleteArtAudit, "ARTICLE_DELETE audit log must exist");
      assert.equal(deleteArtAudit.newState, null);
      createdAuditLogIds.push(deleteArtAudit.id);
    },
  );

  // 9. Filtering, [from, to) date boundary semantics, and pagination
  await t.test(
    "API Filtering and date range semantics: [from, to) interval, same-day, month boundary, invalid range, pagination",
    async () => {
      // Query by action filter
      const actionRes = await request(app)
        .get("/marketing/audit-logs?action=CAMPAIGN_CREATE")
        .set("Authorization", `Bearer ${marketingToken}`);
      assert.equal(actionRes.status, 200);
      for (const item of actionRes.body.items) {
        assert.equal(item.action, "CAMPAIGN_CREATE");
      }

      // Query by entityType filter
      const entityRes = await request(app)
        .get("/marketing/audit-logs?entityType=ARTICLE")
        .set("Authorization", `Bearer ${marketingToken}`);
      assert.equal(entityRes.status, 200);
      for (const item of entityRes.body.items) {
        assert.equal(item.entityType, "ARTICLE");
      }

      // Query by actorId filter
      const actorRes = await request(app)
        .get("/marketing/audit-logs?actorId=SYSTEM")
        .set("Authorization", `Bearer ${marketingToken}`);
      assert.equal(actorRes.status, 200);
      for (const item of actorRes.body.items) {
        assert.equal(item.actorId, "SYSTEM");
      }

      // Query by pagination limit
      const pageRes = await request(app)
        .get("/marketing/audit-logs?limit=2&page=1")
        .set("Authorization", `Bearer ${marketingToken}`);
      assert.equal(pageRes.status, 200);
      assert.ok(pageRes.body.items.length <= 2);
      assert.equal(pageRes.body.limit, 2);
      assert.equal(pageRes.body.page, 1);
      assert.ok(pageRes.body.totalPages >= 1);

      // Same-day query: from=2026-06-01 to=2026-06-01 -> converts to [2026-06-01T00:00:00+07:00, 2026-06-02T00:00:00+07:00)
      const sameDayRes = await request(app)
        .get("/marketing/audit-logs?from=2026-06-01&to=2026-06-01")
        .set("Authorization", `Bearer ${marketingToken}`);
      assert.equal(sameDayRes.status, 200);

      // Month boundary query: from=2026-01-31 to=2026-01-31 -> converts to [2026-01-31T00:00:00+07:00, 2026-02-01T00:00:00+07:00)
      const monthBoundaryRes = await request(app)
        .get("/marketing/audit-logs?from=2026-01-31&to=2026-01-31")
        .set("Authorization", `Bearer ${marketingToken}`);
      assert.equal(monthBoundaryRes.status, 200);

      // Query invalid date range (from > to) -> 400
      const invalidRangeRes = await request(app)
        .get("/marketing/audit-logs?from=2026-12-01&to=2026-01-01")
        .set("Authorization", `Bearer ${marketingToken}`);
      assert.equal(invalidRangeRes.status, 400);

      // Query identical timestamp range where from >= to -> 400
      const identicalInstantRes = await request(app)
        .get(
          "/marketing/audit-logs?from=2026-06-01T00:00:00%2B07:00&to=2026-06-01T00:00:00%2B07:00",
        )
        .set("Authorization", `Bearer ${marketingToken}`);
      assert.equal(identicalInstantRes.status, 400);
    },
  );

  // 10. Secret absence in DB and API response
  await t.test(
    "Sanitizer verification: No secrets present in audit logs or API output",
    async () => {
      const res = await request(app)
        .get("/marketing/audit-logs?limit=50")
        .set("Authorization", `Bearer ${marketingToken}`);
      assert.equal(res.status, 200);

      const jsonString = JSON.stringify(res.body);
      assert.ok(
        !jsonString.includes("super-secret"),
        "No leaked secrets in API responses",
      );
      assert.ok(
        !jsonString.includes("test-access-secret"),
        "No leaked secrets in API responses",
      );
    },
  );
});
