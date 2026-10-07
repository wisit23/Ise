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
app.locals.validateAccessSession = async () => {};

const marketingToken = signAccessToken({
  sub: "mkt-attr-tester",
  role: "MARKETING",
  displayName: "Marketing Attribution Tester",
});

const buyerToken = signAccessToken({
  sub: "buyer-attr-tester",
  role: "BUYER",
  displayName: "Buyer Attribution Tester",
});

const TEST_CAMPAIGN_ID = "attr-int-camp-101";

async function databaseIsReachable() {
  if (!process.env.DATABASE_URL) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

test("Product Service Campaign Attribution & Metrics PostgreSQL Integration Suite (MKT-003, MKT-007, UR-09, UR-12)", async (t) => {
  const reachable = await databaseIsReachable();
  if (!reachable) {
    if (process.env.REQUIRE_INTEGRATION === "1") {
      throw new Error(
        "REQUIRE_INTEGRATION=1 set, but PostgreSQL database is not reachable",
      );
    }
    t.skip("PostgreSQL database not reachable, skipping suite");
    return;
  }

  async function cleanup() {
    const cleanupErrors = [];
    try {
      await prisma.campaignAttribution.deleteMany({
        where: { campaignId: { startsWith: "attr-int-" } },
      });
    } catch (err) {
      // Best-effort cleanup of test campaign attributions
      cleanupErrors.push(err);
    }
    try {
      await prisma.userVoucher.deleteMany({
        where: { campaignId: { startsWith: "attr-int-" } },
      });
    } catch (err) {
      // Best-effort cleanup of test user vouchers
      cleanupErrors.push(err);
    }
    try {
      await prisma.campaign.deleteMany({
        where: { id: { startsWith: "attr-int-" } },
      });
    } catch (err) {
      // Best-effort cleanup of test campaigns
      cleanupErrors.push(err);
    }

    if (cleanupErrors.length > 0 && process.env.DEBUG_TEST_CLEANUP) {
      console.warn(
        `[campaign-attribution cleanup] Encountered ${cleanupErrors.length} non-fatal cleanup errors:`,
        cleanupErrors,
      );
    }
  }

  t.before(async () => {
    await cleanup();

    // Create a published campaign in PostgreSQL
    await prisma.campaign.create({
      data: {
        id: TEST_CAMPAIGN_ID,
        code: "MKT_ATTR_TEST",
        name: "Attribution Test Campaign",
        discountType: "PERCENT",
        discountValue: 15,
        maxDiscount: 500,
        minOrderPrice: 500,
        status: "published",
        startsAt: new Date(Date.now() - 3600_000),
        endsAt: new Date(Date.now() + 86400_000),
        createdById: "mkt-attr-tester",
        usedCount: 4, // 4 claimed vouchers
      },
    });
  });

  t.after(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  const event1 = {
    eventId: "attr-evt-001",
    eventType: "order.completed.v1",
    occurredAt: "2026-08-15T10:00:00.000Z",
    aggregateId: "attr-ord-001",
    payload: {
      orderId: "attr-ord-001",
      campaignId: TEST_CAMPAIGN_ID,
      grossAmount: 2000,
      discountAmount: 300,
      netAmount: 1700,
      completedAt: "2026-08-15T10:00:00.000Z",
    },
  };

  await t.test(
    "Security: POST /internal/campaigns/events/order-completed rejects requests without x-internal-token",
    async () => {
      const res = await request(app)
        .post("/internal/campaigns/events/order-completed")
        .send(event1);

      assert.equal(res.status, 403);
    },
  );

  await t.test(
    "Ingestion: records order.completed.v1 event into real PostgreSQL campaign_attributions",
    async () => {
      const res = await request(app)
        .post("/internal/campaigns/events/order-completed")
        .set("x-internal-token", process.env.INTERNAL_SERVICE_TOKEN)
        .send(event1);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.recorded, true);

      // Verify row persisted in real PostgreSQL
      const row = await prisma.campaignAttribution.findUnique({
        where: { eventId: "attr-evt-001" },
      });

      assert.ok(row);
      assert.equal(row.orderId, "attr-ord-001");
      assert.equal(row.campaignId, TEST_CAMPAIGN_ID);
      assert.equal(row.grossAmount, 2000);
      assert.equal(row.discountAmount, 300);
      assert.equal(row.netAmount, 1700);
    },
  );

  await t.test(
    "Idempotency: duplicate event delivery does not duplicate attribution fact in PostgreSQL",
    async () => {
      // Re-send same event
      const res = await request(app)
        .post("/internal/campaigns/events/order-completed")
        .set("x-internal-token", process.env.INTERNAL_SERVICE_TOKEN)
        .send(event1);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.deduplicated, true);

      // Verify still only 1 row in PostgreSQL
      const count = await prisma.campaignAttribution.count({
        where: { campaignId: TEST_CAMPAIGN_ID },
      });
      assert.equal(count, 1);
    },
  );

  await t.test(
    "Idempotency: re-sending same orderId under different eventId is deduplicated",
    async () => {
      const dupOrderEvent = {
        ...event1,
        eventId: "attr-evt-002",
      };

      const res = await request(app)
        .post("/internal/campaigns/events/order-completed")
        .set("x-internal-token", process.env.INTERNAL_SERVICE_TOKEN)
        .send(dupOrderEvent);

      assert.equal(res.status, 200);
      assert.equal(res.body.deduplicated, true);

      // Count still 1
      const count = await prisma.campaignAttribution.count({
        where: { campaignId: TEST_CAMPAIGN_ID },
      });
      assert.equal(count, 1);
    },
  );

  await t.test(
    "Idempotency conflict: returns 409 Conflict when incoming event has conflicting attribution attributes in PostgreSQL",
    async () => {
      const conflictEvent = {
        ...event1,
        eventId: "attr-evt-conflict",
        payload: {
          ...event1.payload,
          grossAmount: 9999, // conflicting amount for same orderId
        },
        grossAmount: 9999,
      };

      const res = await request(app)
        .post("/internal/campaigns/events/order-completed")
        .set("x-internal-token", process.env.INTERNAL_SERVICE_TOKEN)
        .send(conflictEvent);

      assert.equal(res.status, 409);
      assert.match(res.body.error, /conflict/i);
    },
  );

  await t.test(
    "Idempotency conflict: reusing existing eventId with different orderId returns 409 in PostgreSQL",
    async () => {
      const reuseEventIdDifferentOrder = {
        ...event1,
        aggregateId: "attr-ord-different",
        payload: {
          ...event1.payload,
          orderId: "attr-ord-different", // different orderId, same eventId
        },
        orderId: "attr-ord-different",
      };

      const res = await request(app)
        .post("/internal/campaigns/events/order-completed")
        .set("x-internal-token", process.env.INTERNAL_SERVICE_TOKEN)
        .send(reuseEventIdDifferentOrder);

      assert.equal(res.status, 409);
      assert.match(res.body.error, /conflict/i);
    },
  );

  await t.test(
    "No-campaign orders are ignored gracefully without recording attribution",
    async () => {
      const noCampEvent = {
        eventId: "attr-evt-nocamp",
        orderId: "attr-ord-nocamp",
        campaignId: null,
        grossAmount: 500,
        discountAmount: 0,
        netAmount: 500,
      };

      const res = await request(app)
        .post("/internal/campaigns/events/order-completed")
        .set("x-internal-token", process.env.INTERNAL_SERVICE_TOKEN)
        .send(noCampEvent);

      assert.equal(res.status, 200);
      assert.equal(res.body.recorded, false);
      assert.equal(res.body.reason, "no_campaign");
    },
  );

  await t.test(
    "Metrics: GET /api/products/campaigns/:id/metrics computes accurate KPIs from PostgreSQL (UR-09, UR-12)",
    async () => {
      // Ingest a second completed order
      await request(app)
        .post("/internal/campaigns/events/order-completed")
        .set("x-internal-token", process.env.INTERNAL_SERVICE_TOKEN)
        .send({
          eventId: "attr-evt-003",
          orderId: "attr-ord-003",
          campaignId: TEST_CAMPAIGN_ID,
          grossAmount: 1000,
          discountAmount: 150,
          netAmount: 850,
          completedAt: "2026-08-16T12:00:00.000Z",
        });

      // Query metrics as MARKETING role
      const res = await request(app)
        .get(`/campaigns/${TEST_CAMPAIGN_ID}/metrics`)
        .set("Authorization", `Bearer ${marketingToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.campaignId, TEST_CAMPAIGN_ID);
      assert.equal(res.body.completedOrders, 2);
      assert.equal(res.body.grossRevenue, 3000); // 2000 + 1000
      assert.equal(res.body.totalDiscount, 450); // 300 + 150
      assert.equal(res.body.netRevenue, 2550); // 1700 + 850
      assert.equal(res.body.claimedCount, 4);
      assert.equal(res.body.redeemedCount, 2);
      // 2 / 4 * 100 = 50.00%
      assert.equal(res.body.conversionRate, 50);
    },
  );

  await t.test(
    "Metrics: GET /api/products/campaigns/metrics/overview aggregates across campaigns",
    async () => {
      const res = await request(app)
        .get("/campaigns/metrics/overview")
        .set("Authorization", `Bearer ${marketingToken}`);

      assert.equal(res.status, 200);
      assert.ok(res.body.completedOrders >= 2);
      assert.ok(res.body.grossRevenue >= 3000);
      assert.ok(res.body.netRevenue >= 2550);
    },
  );

  await t.test(
    "Metrics: GET /api/products/campaigns/metrics/trends returns daily series",
    async () => {
      const res = await request(app)
        .get(`/campaigns/metrics/trends?campaignId=${TEST_CAMPAIGN_ID}`)
        .set("Authorization", `Bearer ${marketingToken}`);

      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.series));
      assert.equal(res.body.series.length, 2); // 2026-08-15 and 2026-08-16
      assert.equal(res.body.series[0].date, "2026-08-15");
      assert.equal(res.body.series[0].completedOrders, 1);
      assert.equal(res.body.series[0].grossRevenue, 2000);
      assert.equal(res.body.series[1].date, "2026-08-16");
      assert.equal(res.body.series[1].completedOrders, 1);
      assert.equal(res.body.series[1].grossRevenue, 1000);
    },
  );

  await t.test(
    "Metrics: enforces date range validation (from > to returns 400 Bad Request per MKT-DEC-019)",
    async () => {
      const res = await request(app)
        .get(
          `/campaigns/${TEST_CAMPAIGN_ID}/metrics?from=2026-08-20&to=2026-08-10`,
        )
        .set("Authorization", `Bearer ${marketingToken}`);

      assert.equal(res.status, 400);
    },
  );

  await t.test(
    "RBAC: non-marketing roles are forbidden from accessing metrics",
    async () => {
      const res = await request(app)
        .get(`/campaigns/${TEST_CAMPAIGN_ID}/metrics`)
        .set("Authorization", `Bearer ${buyerToken}`);

      assert.equal(res.status, 403);
    },
  );
});
