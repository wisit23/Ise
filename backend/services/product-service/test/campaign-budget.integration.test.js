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
const TEST_PRODUCT_ID_2 = "bgt-int-prod-002";

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
        budget: 200,
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
        id: "bgt-vch-003",
        campaignId: TEST_CAMPAIGN_ID,
        userId: "bgt-buyer-003",
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
    await prisma.product.create({
      data: {
        id: TEST_PRODUCT_ID_2,
        sellerId: "bgt-seller-002",
        title: "Second Reserved Budget Test Item",
        price: 1000,
        category: "Clothing",
        status: "reserved",
        reservedBy: "bgt-buyer-002",
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
    "1. Quote reserves budget and payment completion commits it once",
    async () => {
      const quote = await request(app)
        .post(`/internal/campaigns/${TEST_CAMPAIGN_ID}/quote-and-hold`)
        .set("x-internal-token", process.env.INTERNAL_SERVICE_TOKEN)
        .send({
          userId: "bgt-buyer-001",
          orderId: "bgt-ord-001",
          productId: TEST_PRODUCT_ID,
        });
      assert.equal(quote.status, 200);
      assert.equal(quote.body.discountAmount, 100);

      let campaign = await prisma.campaign.findUnique({
        where: { id: TEST_CAMPAIGN_ID },
      });
      assert.equal(Number(campaign.spentBudget), 0);
      assert.equal(Number(campaign.reservedBudget), 100);

      const completed = await request(app)
        .post(`/internal/campaigns/${TEST_CAMPAIGN_ID}/complete`)
        .set("x-internal-token", process.env.INTERNAL_SERVICE_TOKEN)
        .send({ userId: "bgt-buyer-001", orderId: "bgt-ord-001" });
      assert.equal(completed.status, 200);

      campaign = await prisma.campaign.findUnique({
        where: { id: TEST_CAMPAIGN_ID },
      });
      assert.equal(Number(campaign.spentBudget), 100);
      assert.equal(Number(campaign.reservedBudget), 0);
      assert.equal(campaign.status, "published");

      const v1 = await prisma.userVoucher.findUnique({
        where: { id: "bgt-vch-001" },
      });
      assert.equal(v1.status, "USED");
    },
  );

  await t.test(
    "2. Payment retry and later attribution do not charge budget twice",
    async () => {
      const retry = await request(app)
        .post(`/internal/campaigns/${TEST_CAMPAIGN_ID}/complete`)
        .set("x-internal-token", process.env.INTERNAL_SERVICE_TOKEN)
        .send({ userId: "bgt-buyer-001", orderId: "bgt-ord-001" });
      assert.equal(retry.status, 200);

      const res = await request(app)
        .post("/internal/campaigns/events/order-completed")
        .set("x-internal-token", process.env.INTERNAL_SERVICE_TOKEN)
        .send(event1);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.recorded, true);

      const campaign = await prisma.campaign.findUnique({
        where: { id: TEST_CAMPAIGN_ID },
      });
      assert.equal(Number(campaign.spentBudget), 100);
      assert.equal(campaign.status, "published");
    },
  );

  await t.test(
    "3. Second paid reservation exhausts budget and closes the campaign",
    async () => {
      const quote = await request(app)
        .post(`/internal/campaigns/${TEST_CAMPAIGN_ID}/quote-and-hold`)
        .set("x-internal-token", process.env.INTERNAL_SERVICE_TOKEN)
        .send({
          userId: "bgt-buyer-002",
          orderId: "bgt-ord-002",
          productId: TEST_PRODUCT_ID_2,
        });
      assert.equal(quote.status, 200);

      const res = await request(app)
        .post(`/internal/campaigns/${TEST_CAMPAIGN_ID}/complete`)
        .set("x-internal-token", process.env.INTERNAL_SERVICE_TOKEN)
        .send({ userId: "bgt-buyer-002", orderId: "bgt-ord-002" });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.voucher.status, "USED");

      const campaign = await prisma.campaign.findUnique({
        where: { id: TEST_CAMPAIGN_ID },
      });
      assert.equal(Number(campaign.spentBudget), 200);
      assert.equal(Number(campaign.reservedBudget), 0);
      assert.equal(campaign.status, "ended");
      assert.equal(campaign.endReason, "BUDGET_EXHAUSTED");

      // Verify CLAIMED vouchers transitioned to EXPIRED
      const v3 = await prisma.userVoucher.findUnique({
        where: { id: "bgt-vch-003" },
      });
      assert.equal(v3.status, "EXPIRED");

      const auditLogs = await prisma.marketingAuditLog.findMany({
        where: {
          entityType: "CAMPAIGN",
          entityId: TEST_CAMPAIGN_ID,
          action: "CAMPAIGN_END",
        },
      });
      assert.equal(auditLogs.length, 1);
      assert.equal(auditLogs[0].actorRole, "SYSTEM");
      assert.equal(auditLogs[0].metadata?.reason, "BUDGET_EXHAUSTED");
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
    "5. Concurrent attribution events record facts without charging budget",
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

      const campaign = await prisma.campaign.findUnique({
        where: { id: CONCURRENT_CAMPAIGN_ID },
      });
      assert.equal(Number(campaign.spentBudget), 0);
      assert.equal(campaign.status, "published");

      // Verify all 5 attribution facts are persisted
      const attributions = await prisma.campaignAttribution.count({
        where: { campaignId: CONCURRENT_CAMPAIGN_ID },
      });
      assert.equal(attributions, 5);
    },
  );
});
