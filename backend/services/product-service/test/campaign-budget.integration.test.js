const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";
process.env.INTERNAL_SERVICE_TOKEN ||= "test-internal-token";
if (
  process.env.DATABASE_URL_PRODUCT &&
  process.env.DATABASE_URL_PRODUCT.includes("@postgres:")
) {
  process.env.DATABASE_URL_PRODUCT = process.env.DATABASE_URL_PRODUCT.replace(
    "@postgres:",
    "@localhost:",
  );
}
if (!process.env.DATABASE_URL_PRODUCT) {
  process.env.DATABASE_URL_PRODUCT =
    "postgresql://reloop:reloop_dev_password@localhost:5432/reloop_product";
}
process.env.DATABASE_URL = process.env.DATABASE_URL_PRODUCT;

const { signAccessToken } = require("@reloop/shared");
const prisma = require("../src/models/prismaClient");
const app = require("../src/app");
app.locals.validateAccessSession = async () => {};

const buyer1Token = signAccessToken({
  sub: "bgt-buyer-001",
  role: "BUYER",
  displayName: "Budget Buyer 1",
});

const buyer3Token = signAccessToken({
  sub: "bgt-buyer-003",
  role: "BUYER",
  displayName: "Budget Buyer 3",
});

const TEST_CAMPAIGN_ID = "bgt-int-camp-001";
const CONCURRENT_CAMPAIGN_ID = "bgt-int-camp-conc";
const TEST_PRODUCT_ID = "bgt-int-prod-001";

async function databaseIsReachable() {
  if (!process.env.DATABASE_URL) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

test("Product Service Campaign Budget Enforcement & Auto-End PostgreSQL Integration Suite", async (t) => {
  const reachable = await databaseIsReachable();
  if (!reachable) {
    throw new Error(
      "REQUIRE_INTEGRATION=1 set, but PostgreSQL database is not reachable. Skipping is disallowed.",
    );
  }

  async function cleanup() {
    const cleanupErrors = [];
    try {
      await prisma.marketingAuditLog.deleteMany({
        where: {
          entityType: "CAMPAIGN",
          entityId: { startsWith: "bgt-int-" },
        },
      });
    } catch (err) {
      cleanupErrors.push(err);
    }
    try {
      await prisma.campaignAttribution.deleteMany({
        where: { campaignId: { startsWith: "bgt-int-" } },
      });
    } catch (err) {
      cleanupErrors.push(err);
    }
    try {
      await prisma.userVoucher.deleteMany({
        where: { campaignId: { startsWith: "bgt-int-" } },
      });
    } catch (err) {
      cleanupErrors.push(err);
    }
    try {
      await prisma.product.deleteMany({
        where: { id: { startsWith: "bgt-int-" } },
      });
    } catch (err) {
      cleanupErrors.push(err);
    }
    try {
      await prisma.campaign.deleteMany({
        where: { id: { startsWith: "bgt-int-" } },
      });
    } catch (err) {
      cleanupErrors.push(err);
    }

    if (cleanupErrors.length > 0 && process.env.DEBUG_TEST_CLEANUP) {
      console.warn(
        `[campaign-budget cleanup] Encountered ${cleanupErrors.length} non-fatal cleanup errors:`,
        cleanupErrors,
      );
    }
  }

  t.before(async () => {
    await cleanup();

    // 1. Create a published campaign with budget and spentBudget = 0
    await prisma.campaign.create({
      data: {
        id: TEST_CAMPAIGN_ID,
        code: "BGT_ACC_001",
        name: "Budget Acceptance Test Campaign",
        discountType: "FIXED",
        discountValue: 100,
        minOrderPrice: 200,
        budget: 500,
        spentBudget: 0,
        status: "published",
        startsAt: new Date(Date.now() - 3600_000),
        endsAt: new Date(Date.now() + 86400_000),
        createdById: "mkt-budget-tester",
      },
    });

    // 2. Create CLAIMED vouchers
    await prisma.userVoucher.create({
      data: {
        id: "bgt-vch-001",
        campaignId: TEST_CAMPAIGN_ID,
        userId: "bgt-buyer-001",
        status: "CLAIMED",
        claimedAt: new Date(),
      },
    });

    await prisma.userVoucher.create({
      data: {
        id: "bgt-vch-002",
        campaignId: TEST_CAMPAIGN_ID,
        userId: "bgt-buyer-002",
        status: "CLAIMED",
        claimedAt: new Date(),
      },
    });

    // 3. Create a reserved product for quote-and-hold test
    await prisma.product.create({
      data: {
        id: TEST_PRODUCT_ID,
        sellerId: "bgt-seller-001",
        title: "Reserved Budget Test Item",
        price: 1000,
        category: "Clothing",
        status: "reserved",
        reservedBy: "bgt-buyer-001",
        reservationExpiresAt: new Date(Date.now() + 3600_000),
      },
    });
  });

  t.after(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  const event1OccurredAt = new Date().toISOString();
  const event1 = {
    eventId: "bgt-evt-001",
    eventType: "order.completed.v1",
    occurredAt: event1OccurredAt,
    aggregateId: "bgt-ord-001",
    payload: {
      orderId: "bgt-ord-001",
      campaignId: TEST_CAMPAIGN_ID,
      grossAmount: 1000,
      discountAmount: 200,
      netAmount: 800,
      completedAt: event1OccurredAt,
    },
  };

  await t.test(
    "1. Ingestion below budget: increments spentBudget and campaign remains published",
    async () => {
      const res = await request(app)
        .post("/internal/campaigns/events/order-completed")
        .set("x-internal-token", process.env.INTERNAL_SERVICE_TOKEN)
        .send(event1);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.recorded, true);

      // Verify in PostgreSQL: spentBudget incremented to 200, status still published
      const campaign = await prisma.campaign.findUnique({
        where: { id: TEST_CAMPAIGN_ID },
      });
      assert.ok(campaign);
      assert.equal(campaign.spentBudget, 200);
      assert.equal(campaign.status, "published");

      // Verify vouchers still CLAIMED
      const v1 = await prisma.userVoucher.findUnique({
        where: { id: "bgt-vch-001" },
      });
      assert.equal(v1.status, "CLAIMED");
    },
  );

  await t.test(
    "2. Idempotency: duplicate event delivery does NOT increment spentBudget again",
    async () => {
      const res = await request(app)
        .post("/internal/campaigns/events/order-completed")
        .set("x-internal-token", process.env.INTERNAL_SERVICE_TOKEN)
        .send(event1);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.deduplicated, true);

      // Verify spentBudget remains 200 (not 400)
      const campaign = await prisma.campaign.findUnique({
        where: { id: TEST_CAMPAIGN_ID },
      });
      assert.equal(campaign.spentBudget, 200);
      assert.equal(campaign.status, "published");
    },
  );

  await t.test(
    "3. Budget threshold reached: transitions campaign to ended, expires CLAIMED vouchers, and writes SYSTEM audit log",
    async () => {
      // Second completed event with discountAmount 300 -> total spentBudget = 200 + 300 = 500 >= budget 500
      const event2 = {
        eventId: "bgt-evt-002",
        eventType: "order.completed.v1",
        occurredAt: new Date().toISOString(),
        aggregateId: "bgt-ord-002",
        payload: {
          orderId: "bgt-ord-002",
          campaignId: TEST_CAMPAIGN_ID,
          grossAmount: 1500,
          discountAmount: 300,
          netAmount: 1200,
          completedAt: new Date().toISOString(),
        },
      };

      const res = await request(app)
        .post("/internal/campaigns/events/order-completed")
        .set("x-internal-token", process.env.INTERNAL_SERVICE_TOKEN)
        .send(event2);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.recorded, true);

      // Verify campaign status updated to ended and spentBudget is 500
      const campaign = await prisma.campaign.findUnique({
        where: { id: TEST_CAMPAIGN_ID },
      });
      assert.equal(campaign.spentBudget, 500);
      assert.equal(campaign.status, "ended");

      // Verify CLAIMED vouchers transitioned to EXPIRED
      const v1 = await prisma.userVoucher.findUnique({
        where: { id: "bgt-vch-001" },
      });
      const v2 = await prisma.userVoucher.findUnique({
        where: { id: "bgt-vch-002" },
      });
      assert.equal(v1.status, "EXPIRED");
      assert.equal(v2.status, "EXPIRED");

      // Verify SYSTEM MarketingAuditLog: action = CAMPAIGN_END, metadata.reason = BUDGET_REACHED, exactly 1 entry
      const auditLogs = await prisma.marketingAuditLog.findMany({
        where: {
          entityType: "CAMPAIGN",
          entityId: TEST_CAMPAIGN_ID,
          action: "CAMPAIGN_END",
        },
      });
      assert.equal(auditLogs.length, 1);
      assert.equal(auditLogs[0].actorRole, "SYSTEM");
      assert.equal(auditLogs[0].metadata?.reason, "BUDGET_REACHED");
    },
  );

  await t.test(
    "4. Post-ended gating: Claim, Applicable, and Quote-and-Hold are strictly rejected",
    async () => {
      // 1. Claim fails because campaign is ended / budget is exhausted
      const claimRes = await request(app)
        .post(`/campaigns/${TEST_CAMPAIGN_ID}/claim`)
        .set("Authorization", `Bearer ${buyer3Token}`);
      assert.equal(claimRes.status, 409);

      // 2. Applicable vouchers returns empty list (voucher cannot be applied)
      const applicableRes = await request(app)
        .post("/campaigns/applicable")
        .set("Authorization", `Bearer ${buyer1Token}`)
        .send({
          price: 1000,
        });
      assert.equal(applicableRes.status, 200);
      assert.equal(applicableRes.body.length, 0);

      // validate-discount explicitly rejects with 400 Bad Request
      const validateRes = await request(app)
        .post(`/internal/campaigns/${TEST_CAMPAIGN_ID}/validate-discount`)
        .set("x-internal-token", process.env.INTERNAL_SERVICE_TOKEN)
        .send({
          campaignId: TEST_CAMPAIGN_ID,
          userId: "bgt-buyer-001",
          price: 1000,
        });
      assert.equal(validateRes.status, 400);

      // 3. Quote-and-Hold rejects expired voucher / ended campaign with 400 Bad Request
      const quoteRes = await request(app)
        .post(`/internal/campaigns/${TEST_CAMPAIGN_ID}/quote-and-hold`)
        .set("x-internal-token", process.env.INTERNAL_SERVICE_TOKEN)
        .send({
          campaignId: TEST_CAMPAIGN_ID,
          userId: "bgt-buyer-001",
          orderId: "bgt-ord-hold-test",
          productId: TEST_PRODUCT_ID,
        });
      assert.equal(quoteRes.status, 400);
    },
  );

  await t.test(
    "5. Real PostgreSQL Concurrency: concurrent completed events perform atomic increment of spentBudget",
    async () => {
      // Create a separate campaign for concurrency test
      await prisma.campaign.create({
        data: {
          id: CONCURRENT_CAMPAIGN_ID,
          code: "BGT_CONC_001",
          name: "Concurrent Budget Test Campaign",
          discountType: "FIXED",
          discountValue: 100,
          minOrderPrice: 200,
          budget: 10000,
          spentBudget: 0,
          status: "published",
          startsAt: new Date(Date.now() - 3600_000),
          endsAt: new Date(Date.now() + 86400_000),
          createdById: "mkt-budget-tester",
        },
      });

      // 5 concurrent unique completed order events with discount 150 each
      const concurrentEvents = Array.from({ length: 5 }, (_, i) => ({
        eventId: `bgt-conc-evt-${i + 1}`,
        eventType: "order.completed.v1",
        occurredAt: new Date().toISOString(),
        aggregateId: `bgt-conc-ord-${i + 1}`,
        payload: {
          orderId: `bgt-conc-ord-${i + 1}`,
          campaignId: CONCURRENT_CAMPAIGN_ID,
          grossAmount: 1000,
          discountAmount: 150,
          netAmount: 850,
          completedAt: new Date().toISOString(),
        },
      }));

      const responses = await Promise.all(
        concurrentEvents.map((evt) =>
          request(app)
            .post("/internal/campaigns/events/order-completed")
            .set("x-internal-token", process.env.INTERNAL_SERVICE_TOKEN)
            .send(evt),
        ),
      );

      for (const res of responses) {
        assert.equal(res.status, 200);
        assert.equal(res.body.success, true);
      }

      // Verify in PostgreSQL: spentBudget must be exactly 5 * 150 = 750
      const campaign = await prisma.campaign.findUnique({
        where: { id: CONCURRENT_CAMPAIGN_ID },
      });
      assert.equal(campaign.spentBudget, 750);

      // Verify all 5 attribution facts are persisted
      const attributions = await prisma.campaignAttribution.count({
        where: { campaignId: CONCURRENT_CAMPAIGN_ID },
      });
      assert.equal(attributions, 5);
    },
  );
});
