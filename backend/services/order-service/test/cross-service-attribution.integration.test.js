const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";
process.env.INTERNAL_SERVICE_TOKEN ||= "test-internal-token";

// Standardize database connection URLs for order-service and product-service
const baseOrderDb =
  process.env.DATABASE_URL_ORDER ||
  process.env.DATABASE_URL ||
  "postgresql://reloop:reloop_dev_password@localhost:5432/reloop_order?schema=public";
const normalizedOrderDb = baseOrderDb.includes("@postgres:")
  ? baseOrderDb.replace("@postgres:", "@localhost:")
  : baseOrderDb;

const baseProductDb =
  process.env.DATABASE_URL_PRODUCT ||
  (process.env.DATABASE_URL
    ? process.env.DATABASE_URL.replace(
        /\/reloop_[a-z]+(?=[/?]|$)/,
        "/reloop_product",
      )
    : "postgresql://reloop:reloop_dev_password@localhost:5432/reloop_product?schema=public");
const normalizedProductDb = baseProductDb.includes("@postgres:")
  ? baseProductDb.replace("@postgres:", "@localhost:")
  : baseProductDb;

process.env.DATABASE_URL_ORDER = normalizedOrderDb;
process.env.DATABASE_URL_PRODUCT = normalizedProductDb;

const orderPrisma = require("../src/models/prismaClient");
const orderModel = require("../src/models/orderModel");
const attributionOutboxService = require("../src/services/attributionOutboxService");
const productClient = require("../src/services/productClient");

const TEST_PREFIX = "cross-svc-";
const TEST_CAMPAIGN_ID = `${TEST_PREFIX}camp-900`;
const TEST_BUYER_ID = `${TEST_PREFIX}buyer-900`;
const TEST_SELLER_ID = `${TEST_PREFIX}seller-900`;
const TEST_PRODUCT_ID = `${TEST_PREFIX}prod-900`;

function getProductPrisma() {
  const ProductPrismaClient =
    require("../../product-service/src/generated/prisma-client").PrismaClient;
  return new ProductPrismaClient({
    datasources: { db: { url: process.env.DATABASE_URL_PRODUCT } },
  });
}

const productPrisma = getProductPrisma();

async function databasesAreReachable() {
  try {
    await orderPrisma.$queryRaw`SELECT 1`;
    await productPrisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

test("Genuine Cross-Service Campaign Attribution & Durable Outbox PostgreSQL Suite (UR-09, UR-12, MKT-003, MKT-007)", async (t) => {
  const reachable = await databasesAreReachable();
  if (!reachable) {
    if (process.env.REQUIRE_INTEGRATION === "1") {
      throw new Error(
        "REQUIRE_INTEGRATION=1 is set, but PostgreSQL databases (reloop_order or reloop_product) are not reachable.",
      );
    }
    t.skip("PostgreSQL databases not reachable, skipping cross-service suite");
    return;
  }

  let localServer = null;

  async function cleanup() {
    const cleanupErrors = [];
    try {
      attributionOutboxService.stopWorker();
    } catch (err) {
      // Best-effort: worker may not have been started yet
      cleanupErrors.push(err);
    }

    // Clean up product-service campaign attributions and campaigns in reloop_product
    try {
      await productPrisma.campaignAttribution.deleteMany({
        where: { campaignId: { startsWith: TEST_PREFIX } },
      });
    } catch (err) {
      // Best-effort cleanup of test campaign attributions in reloop_product
      cleanupErrors.push(err);
    }
    try {
      await productPrisma.campaign.deleteMany({
        where: { id: { startsWith: TEST_PREFIX } },
      });
    } catch (err) {
      // Best-effort cleanup of test campaigns in reloop_product
      cleanupErrors.push(err);
    }

    // Clean up order-service outbox and orders in reloop_order
    try {
      await orderPrisma.attributionOutboxEvent.deleteMany({
        where: { campaignId: { startsWith: TEST_PREFIX } },
      });
    } catch (err) {
      // Best-effort cleanup of test outbox events in reloop_order
      cleanupErrors.push(err);
    }
    try {
      await orderPrisma.productSyncEvent.deleteMany({
        where: { order: { buyerId: { startsWith: TEST_PREFIX } } },
      });
    } catch (err) {
      // Best-effort cleanup of test sync events in reloop_order
      cleanupErrors.push(err);
    }
    try {
      await orderPrisma.order.deleteMany({
        where: { buyerId: { startsWith: TEST_PREFIX } },
      });
    } catch (err) {
      // Best-effort cleanup of test orders in reloop_order
      cleanupErrors.push(err);
    }

    if (cleanupErrors.length > 0 && process.env.DEBUG_TEST_CLEANUP) {
      console.warn(
        `[cross-service cleanup] Encountered ${cleanupErrors.length} non-fatal cleanup errors:`,
        cleanupErrors,
      );
    }
  }

  t.before(async () => {
    await cleanup();

    // Verify Product Service availability: use live running container or real productApp
    const targetUrl =
      process.env.PRODUCT_SERVICE_URL || "http://product-service:3002";
    let liveReachable = false;
    try {
      const res = await fetch(`${targetUrl}/health`);
      if (res.ok) liveReachable = true;
    } catch {
      // Best-effort health probe: live container not reachable, fallback to starting local server
    }

    if (liveReachable) {
      process.env.PRODUCT_SERVICE_URL = targetUrl;
    } else {
      // Start local server using genuine productApp instantiated with DATABASE_URL_PRODUCT
      const productApp = require("../../product-service/src/app");
      localServer = http.createServer(productApp);
      await new Promise((resolve, reject) => {
        localServer.listen(0, "127.0.0.1", () => resolve());
        localServer.on("error", reject);
      });
      const port = localServer.address().port;
      process.env.PRODUCT_SERVICE_URL = `http://127.0.0.1:${port}`;
    }

    // Seed test campaign in real PostgreSQL reloop_product
    await productPrisma.campaign.create({
      data: {
        id: TEST_CAMPAIGN_ID,
        code: "CROSS_SVC_PROMO",
        name: "Cross-Service Promo Test",
        discountType: "FIXED",
        discountValue: 300,
        minOrderPrice: 1000,
        status: "published",
        startsAt: new Date(Date.now() - 3600_000),
        endsAt: new Date(Date.now() + 86400_000),
        createdById: "cross-tester",
        usedCount: 2,
      },
    });
  });

  t.after(async () => {
    await cleanup();
    if (localServer) {
      await new Promise((resolve) => localServer.close(resolve));
    }
    await orderPrisma.$disconnect();
    await productPrisma.$disconnect();
  });

  let campaignOrder = null;
  let outboxEvent = null;

  await t.test(
    "Step 1: Order completion in reloop_order atomically creates AttributionOutboxEvent",
    async () => {
      // Create shipped order in reloop_order
      campaignOrder = await orderPrisma.order.create({
        data: {
          buyerId: TEST_BUYER_ID,
          sellerId: TEST_SELLER_ID,
          productId: TEST_PRODUCT_ID,
          productTitle: "Genuine Cross-Service Product",
          price: 2500,
          campaignId: TEST_CAMPAIGN_ID,
          campaignCode: "CROSS_SVC_PROMO",
          discountAmount: 500,
          finalPrice: 2000,
          status: "shipped",
        },
      });

      assert.ok(campaignOrder.id);
      assert.equal(campaignOrder.status, "shipped");

      // Atomically transition status to "completed" in reloop_order
      const transitionResult = await orderModel.transitionStatusWithProductSync(
        {
          id: campaignOrder.id,
          status: "completed",
          expectedVersion: campaignOrder.version,
          expectedStatuses: ["shipped"],
          productSync: {
            dedupeKey: `sync:${campaignOrder.id}:1`,
            action: "SET_STATUS",
            productId: TEST_PRODUCT_ID,
            targetStatus: "sold",
          },
        },
      );

      assert.equal(transitionResult.order.status, "completed");
      assert.ok(transitionResult.attributionEvent);
      assert.equal(transitionResult.attributionEvent.orderId, campaignOrder.id);
      assert.equal(
        transitionResult.attributionEvent.campaignId,
        TEST_CAMPAIGN_ID,
      );
      assert.equal(transitionResult.attributionEvent.grossAmount, 2500);
      assert.equal(transitionResult.attributionEvent.discountAmount, 500);
      assert.equal(transitionResult.attributionEvent.netAmount, 2000);

      outboxEvent = transitionResult.attributionEvent;

      // Query reloop_order directly: outbox event must exist with processedAt = null
      const outboxInDb = await orderPrisma.attributionOutboxEvent.findUnique({
        where: { orderId: campaignOrder.id },
      });
      assert.ok(outboxInDb);
      assert.equal(outboxInDb.id, outboxEvent.id);
      assert.equal(outboxInDb.processedAt, null);
      assert.equal(outboxInDb.attempts, 0);
      assert.equal(outboxInDb.lastError, null);

      // Verify reloop_product does not yet have this fact
      const initialFact = await productPrisma.campaignAttribution.findUnique({
        where: { orderId: campaignOrder.id },
      });
      assert.equal(initialFact, null);
    },
  );

  await t.test(
    "Step 2: Real HTTP delivery via productClient delivers to Product Service and updates processedAt in reloop_order",
    async () => {
      // Deliver through genuine productClient and outbox service
      const delivered = await attributionOutboxService.processEvent(
        outboxEvent.id,
        {
          db: orderPrisma,
          client: productClient,
        },
      );

      assert.ok(delivered);
      assert.ok(delivered.processedAt);
      assert.equal(delivered.attempts, 1);
      assert.equal(delivered.lastError, null);

      // Query reloop_order PostgreSQL database directly to verify state change
      const outboxRow = await orderPrisma.attributionOutboxEvent.findUnique({
        where: { id: outboxEvent.id },
      });
      assert.ok(outboxRow.processedAt);
      assert.equal(outboxRow.attempts, 1);
      assert.equal(outboxRow.lastError, null);
    },
  );

  await t.test(
    "Step 3: Verification in reloop_product: CampaignAttribution is durably persisted in PostgreSQL",
    async () => {
      // Query reloop_product PostgreSQL database directly to verify cross-service fact persistence
      const factInDb = await productPrisma.campaignAttribution.findUnique({
        where: { orderId: campaignOrder.id },
      });

      assert.ok(factInDb);
      assert.equal(factInDb.eventId, outboxEvent.id);
      assert.equal(factInDb.orderId, campaignOrder.id);
      assert.equal(factInDb.campaignId, TEST_CAMPAIGN_ID);
      assert.equal(factInDb.grossAmount, 2500);
      assert.equal(factInDb.discountAmount, 500);
      assert.equal(factInDb.netAmount, 2000);
      assert.ok(factInDb.completedAt);
    },
  );

  await t.test(
    "Step 4: Idempotent re-delivery over real HTTP returns deduplicated and does not duplicate row in reloop_product",
    async () => {
      const retryResponse = await productClient.recordOrderCompleted({
        eventId: outboxEvent.id,
        eventType: "order.completed.v1",
        occurredAt: outboxEvent.completedAt.toISOString(),
        aggregateId: campaignOrder.id,
        payload: {
          orderId: campaignOrder.id,
          campaignId: TEST_CAMPAIGN_ID,
          grossAmount: 2500,
          discountAmount: 500,
          netAmount: 2000,
          completedAt: outboxEvent.completedAt.toISOString(),
        },
        orderId: campaignOrder.id,
        campaignId: TEST_CAMPAIGN_ID,
        grossAmount: 2500,
        discountAmount: 500,
        netAmount: 2000,
        completedAt: outboxEvent.completedAt.toISOString(),
      });

      assert.equal(retryResponse.success, true);
      assert.equal(retryResponse.deduplicated, true);

      // Verify row count in reloop_product remains exactly 1
      const count = await productPrisma.campaignAttribution.count({
        where: { orderId: campaignOrder.id },
      });
      assert.equal(count, 1);
    },
  );

  await t.test(
    "Step 5: Strengthened Idempotency: Conflicting attribution fields over real HTTP returns 409 Conflict",
    async () => {
      // Attempt to send conflicting grossAmount for the same orderId
      await assert.rejects(
        () =>
          productClient.recordOrderCompleted({
            eventId: "cross-svc-conflict-evt",
            orderId: campaignOrder.id, // same orderId
            campaignId: TEST_CAMPAIGN_ID,
            grossAmount: 9999, // CONFLICTING AMOUNT
            discountAmount: 500,
            netAmount: 9499,
          }),
        (err) =>
          err.status === 409 ||
          String(err?.message || err).includes("conflict"),
      );

      // Fact in reloop_product remains unchanged with original 2500 gross amount
      const fact = await productPrisma.campaignAttribution.findUnique({
        where: { orderId: campaignOrder.id },
      });
      assert.equal(fact.grossAmount, 2500);
      assert.equal(fact.netAmount, 2000);
    },
  );

  await t.test(
    "Step 6: Strengthened Idempotency: Reusing eventId with different orderId over real HTTP returns 409 Conflict",
    async () => {
      // Attempt to reuse existing eventId with a different orderId, even with identical monetary fields
      await assert.rejects(
        () =>
          productClient.recordOrderCompleted({
            eventId: outboxEvent.id, // REUSING existing eventId
            orderId: `${TEST_PREFIX}order-DIFFERENT`, // DIFFERENT orderId
            campaignId: TEST_CAMPAIGN_ID,
            grossAmount: 2500,
            discountAmount: 500,
            netAmount: 2000,
          }),
        (err) =>
          err.status === 409 ||
          String(err?.message || err).includes("conflict"),
      );

      // Verify reloop_product did not persist attribution for the different order
      const fact = await productPrisma.campaignAttribution.findUnique({
        where: { orderId: `${TEST_PREFIX}order-DIFFERENT` },
      });
      assert.equal(fact, null);
    },
  );

  await t.test(
    "Step 7: Delivery failure records lastError and nextAttemptAt in reloop_order PostgreSQL while keeping processedAt null",
    async () => {
      // Create second campaign order in reloop_order
      const order2 = await orderPrisma.order.create({
        data: {
          buyerId: `${TEST_BUYER_ID}-2`,
          sellerId: TEST_SELLER_ID,
          productId: TEST_PRODUCT_ID,
          productTitle: "Cross-Service Failure Test Product",
          price: 1500,
          campaignId: TEST_CAMPAIGN_ID,
          campaignCode: "CROSS_SVC_PROMO",
          discountAmount: 300,
          finalPrice: 1200,
          status: "shipped",
        },
      });

      const transition = await orderModel.transitionStatusWithProductSync({
        id: order2.id,
        status: "completed",
        expectedVersion: order2.version,
        expectedStatuses: ["shipped"],
        productSync: {
          dedupeKey: `sync:${order2.id}:1`,
          action: "SET_STATUS",
          productId: TEST_PRODUCT_ID,
          targetStatus: "sold",
        },
      });

      const outbox2 = transition.attributionEvent;
      assert.ok(outbox2);

      // Simulate a transient 503 delivery failure
      const failingClient = {
        recordOrderCompleted: async () => {
          const err = new Error("Product Service 503 Unavailable");
          err.status = 503;
          throw err;
        },
      };

      await assert.rejects(
        () =>
          attributionOutboxService.processEvent(outbox2.id, {
            db: orderPrisma,
            client: failingClient,
          }),
        /503 Unavailable/,
      );

      // Verify in reloop_order PostgreSQL: attempts incremented, lastError persisted, processedAt remains null
      const rowInDb = await orderPrisma.attributionOutboxEvent.findUnique({
        where: { id: outbox2.id },
      });
      assert.equal(rowInDb.processedAt, null);
      assert.equal(rowInDb.attempts, 1);
      assert.match(rowInDb.lastError, /503 Unavailable/);
      assert.ok(new Date(rowInDb.nextAttemptAt) > new Date());
    },
  );

  await t.test(
    "Step 8: Worker Sweep: processPendingEvents recovers and sweeps backed-off events over real HTTP to reloop_product",
    async () => {
      // Find the backed-off event from Step 7 and reset nextAttemptAt to the past
      const pendingEvent = await orderPrisma.attributionOutboxEvent.findFirst({
        where: { order: { buyerId: `${TEST_BUYER_ID}-2` }, processedAt: null },
      });
      assert.ok(pendingEvent);

      await orderPrisma.attributionOutboxEvent.update({
        where: { id: pendingEvent.id },
        data: { nextAttemptAt: new Date(Date.now() - 5000) },
      });

      // Execute worker sweep with genuine productClient over real HTTP
      const processedResults =
        await attributionOutboxService.processPendingEvents({
          db: orderPrisma,
          client: productClient,
          limit: 10,
        });

      const matchingResult = processedResults.find(
        (r) => r.status === "fulfilled" && r.value?.id === pendingEvent.id,
      );
      assert.ok(matchingResult);
      assert.ok(matchingResult.value.processedAt);
      assert.equal(matchingResult.value.lastError, null);

      // Verify reloop_order PostgreSQL state
      const updatedOutbox = await orderPrisma.attributionOutboxEvent.findUnique(
        {
          where: { id: pendingEvent.id },
        },
      );
      assert.ok(updatedOutbox.processedAt);
      assert.equal(updatedOutbox.attempts, 2);
      assert.equal(updatedOutbox.lastError, null);

      // Verify reloop_product PostgreSQL state: CampaignAttribution was persisted
      const persistedFact = await productPrisma.campaignAttribution.findUnique({
        where: { orderId: pendingEvent.orderId },
      });
      assert.ok(persistedFact);
      assert.equal(persistedFact.grossAmount, 1500);
      assert.equal(persistedFact.discountAmount, 300);
      assert.equal(persistedFact.netAmount, 1200);
    },
  );

  await t.test(
    "Step 9: Non-campaign orders do NOT create AttributionOutboxEvent in reloop_order",
    async () => {
      // Create order without campaign
      const noCampOrder = await orderPrisma.order.create({
        data: {
          buyerId: `${TEST_BUYER_ID}-nocamp`,
          sellerId: TEST_SELLER_ID,
          productId: TEST_PRODUCT_ID,
          productTitle: "Non-Campaign Product",
          price: 999,
          status: "shipped",
        },
      });

      const transition = await orderModel.transitionStatusWithProductSync({
        id: noCampOrder.id,
        status: "completed",
        expectedVersion: noCampOrder.version,
        expectedStatuses: ["shipped"],
        productSync: {
          dedupeKey: `sync:${noCampOrder.id}:1`,
          action: "SET_STATUS",
          productId: TEST_PRODUCT_ID,
          targetStatus: "sold",
        },
      });

      assert.equal(transition.order.status, "completed");
      assert.equal(transition.attributionEvent, null);

      // Direct PostgreSQL query in reloop_order: ensure no outbox row exists
      const outboxRow = await orderPrisma.attributionOutboxEvent.findUnique({
        where: { orderId: noCampOrder.id },
      });
      assert.equal(outboxRow, null);
    },
  );
});
