const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";
process.env.INTERNAL_SERVICE_TOKEN ||= "test-internal-token";
if (process.env.DATABASE_URL_ORDER) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_ORDER;
}

const orderPrisma = require("../src/models/prismaClient");
const orderModel = require("../src/models/orderModel");
const attributionOutboxService = require("../src/services/attributionOutboxService");
const productClient = require("../src/services/productClient");

const TEST_PREFIX = "attr-outbox-";
const TEST_CAMPAIGN_ID = `${TEST_PREFIX}camp-101`;
const TEST_BUYER_ID = `${TEST_PREFIX}buyer-101`;
const TEST_SELLER_ID = `${TEST_PREFIX}seller-101`;
const TEST_PRODUCT_ID = `${TEST_PREFIX}prod-101`;

async function databaseIsReachable() {
  if (!process.env.DATABASE_URL) return false;
  try {
    await orderPrisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

test("Order Service Campaign Attribution Outbox Integration Suite (UR-09, UR-12, MKT-003, MKT-007)", async (t) => {
  const reachable = await databaseIsReachable();
  if (!reachable) {
    if (process.env.REQUIRE_INTEGRATION === "1") {
      throw new Error(
        "REQUIRE_INTEGRATION=1 is set, but PostgreSQL database reloop_order is not reachable.",
      );
    }
    t.skip("PostgreSQL database not reachable, skipping integration test");
    return;
  }

  let mockServer = null;
  let mockServerUrl = "";
  let mockHandler = (req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, recorded: true }));
  };
  const receivedRequests = [];

  function startMockServer() {
    return new Promise((resolve, reject) => {
      mockServer = http.createServer((req, res) => {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
        });
        req.on("end", () => {
          let parsed = null;
          try {
            parsed = body ? JSON.parse(body) : null;
          } catch {
            // Best-effort JSON parsing for mock requests
            parsed = null;
          }
          receivedRequests.push({
            method: req.method,
            url: req.url,
            headers: req.headers,
            body: parsed,
          });
          mockHandler(req, res, parsed);
        });
      });
      mockServer.listen(0, "127.0.0.1", () => {
        const port = mockServer.address().port;
        mockServerUrl = `http://127.0.0.1:${port}`;
        process.env.PRODUCT_SERVICE_URL = mockServerUrl;
        resolve();
      });
      mockServer.on("error", reject);
    });
  }

  function stopMockServer() {
    return new Promise((resolve) => {
      if (!mockServer) return resolve();
      mockServer.close(() => resolve());
    });
  }

  async function cleanup() {
    const cleanupErrors = [];
    try {
      attributionOutboxService.stopWorker();
    } catch (err) {
      // Best-effort: worker may not have been started
      cleanupErrors.push(err);
    }

    try {
      await orderPrisma.attributionOutboxEvent.deleteMany({
        where: { campaignId: { startsWith: TEST_PREFIX } },
      });
    } catch (err) {
      // Best-effort cleanup of test outbox events
      cleanupErrors.push(err);
    }
    try {
      await orderPrisma.productSyncEvent.deleteMany({
        where: { order: { buyerId: { startsWith: TEST_PREFIX } } },
      });
    } catch (err) {
      // Best-effort cleanup of test sync events
      cleanupErrors.push(err);
    }
    try {
      await orderPrisma.order.deleteMany({
        where: { buyerId: { startsWith: TEST_PREFIX } },
      });
    } catch (err) {
      // Best-effort cleanup of test orders
      cleanupErrors.push(err);
    }

    if (cleanupErrors.length > 0 && process.env.DEBUG_TEST_CLEANUP) {
      console.warn(
        `[order-attribution cleanup] Encountered ${cleanupErrors.length} non-fatal cleanup errors:`,
        cleanupErrors,
      );
    }
  }

  t.before(async () => {
    await cleanup();
    await startMockServer();
  });

  t.after(async () => {
    await cleanup();
    await stopMockServer();
    await orderPrisma.$disconnect();
  });

  let campaignOrder = null;
  let outboxEvent = null;

  await t.test(
    "Step 1: Order completion atomically creates AttributionOutboxEvent in PostgreSQL reloop_order",
    async () => {
      campaignOrder = await orderPrisma.order.create({
        data: {
          buyerId: TEST_BUYER_ID,
          sellerId: TEST_SELLER_ID,
          productId: TEST_PRODUCT_ID,
          productTitle: "Attribution Test Order",
          price: 2500,
          campaignId: TEST_CAMPAIGN_ID,
          campaignCode: "ATTR_PROMO_500",
          discountAmount: 500,
          finalPrice: 2000,
          status: "shipped",
        },
      });

      assert.ok(campaignOrder.id);
      assert.equal(campaignOrder.status, "shipped");

      // Atomically transition status to "completed"
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

      // Verify row in real PostgreSQL attribution_outbox_events
      const row = await orderPrisma.attributionOutboxEvent.findUnique({
        where: { orderId: campaignOrder.id },
      });

      assert.ok(row);
      assert.equal(row.id, outboxEvent.id);
      assert.equal(row.campaignId, TEST_CAMPAIGN_ID);
      assert.equal(row.processedAt, null);
      assert.equal(row.attempts, 0);
      assert.equal(row.lastError, null);
    },
  );

  await t.test(
    "Step 2: Non-campaign orders do NOT create AttributionOutboxEvent",
    async () => {
      const nonCampOrder = await orderPrisma.order.create({
        data: {
          buyerId: TEST_BUYER_ID,
          sellerId: TEST_SELLER_ID,
          productId: TEST_PRODUCT_ID,
          productTitle: "Non-campaign Listing",
          price: 1000,
          campaignId: null,
          discountAmount: 0,
          finalPrice: 1000,
          status: "shipped",
        },
      });

      const transitionResult = await orderModel.transitionStatusWithProductSync(
        {
          id: nonCampOrder.id,
          status: "completed",
          expectedVersion: nonCampOrder.version,
          expectedStatuses: ["shipped"],
          productSync: {
            dedupeKey: `sync:${nonCampOrder.id}:1`,
            action: "SET_STATUS",
            productId: TEST_PRODUCT_ID,
            targetStatus: "sold",
          },
        },
      );

      assert.equal(transitionResult.order.status, "completed");
      assert.equal(transitionResult.attributionEvent, null);

      const outboxInDb = await orderPrisma.attributionOutboxEvent.findUnique({
        where: { orderId: nonCampOrder.id },
      });
      assert.equal(outboxInDb, null);
    },
  );

  await t.test(
    "Step 3: Outbox delivery sends REST contract with x-internal-token and marks outbox processed",
    async () => {
      receivedRequests.length = 0;
      mockHandler = (req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, recorded: true }));
      };

      const processed = await attributionOutboxService.processEvent(
        outboxEvent.id,
        {
          db: orderPrisma,
          client: productClient,
        },
      );

      assert.ok(processed);
      assert.ok(processed.processedAt);
      assert.equal(processed.attempts, 1);
      assert.equal(processed.lastError, null);

      // Verify HTTP request received by Product Service contract
      assert.equal(receivedRequests.length, 1);
      const req = receivedRequests[0];
      assert.equal(req.method, "POST");
      assert.equal(req.url, "/internal/campaigns/events/order-completed");
      assert.equal(
        req.headers["x-internal-token"],
        process.env.INTERNAL_SERVICE_TOKEN,
      );
      assert.equal(req.body.eventId, outboxEvent.id);
      assert.equal(req.body.eventType, "order.completed.v1");
      assert.equal(req.body.aggregateId, campaignOrder.id);
      assert.equal(req.body.payload.orderId, campaignOrder.id);
      assert.equal(req.body.payload.campaignId, TEST_CAMPAIGN_ID);
      assert.equal(req.body.payload.grossAmount, 2500);
      assert.equal(req.body.payload.discountAmount, 500);
      assert.equal(req.body.payload.netAmount, 2000);

      // Verify row updated in PostgreSQL
      const row = await orderPrisma.attributionOutboxEvent.findUnique({
        where: { id: outboxEvent.id },
      });
      assert.ok(row.processedAt);
      assert.equal(row.attempts, 1);
      assert.equal(row.lastError, null);
    },
  );

  await t.test(
    "Step 4: Retry handling: on failure, updates attempts, nextAttemptAt, lastError, and leaves processedAt null",
    async () => {
      // Configure mock server to fail with 503 Service Unavailable BEFORE transitioning order
      mockHandler = (req, res) => {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Product service temporarily down" }));
      };

      // Create a second campaign order
      const order2 = await orderPrisma.order.create({
        data: {
          buyerId: TEST_BUYER_ID,
          sellerId: TEST_SELLER_ID,
          productId: TEST_PRODUCT_ID,
          productTitle: "Attribution Retry Order",
          price: 3000,
          campaignId: TEST_CAMPAIGN_ID,
          campaignCode: "ATTR_PROMO_500",
          discountAmount: 500,
          finalPrice: 2500,
          status: "shipped",
        },
      });

      const transitionResult = await orderModel.transitionStatusWithProductSync(
        {
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
        },
      );

      const outbox2 = transitionResult.attributionEvent;
      assert.ok(outbox2);

      // Process event — should fail and throw
      await assert.rejects(
        () =>
          attributionOutboxService.processEvent(outbox2.id, {
            db: orderPrisma,
            client: productClient,
          }),
        (err) => {
          const msg = String(err?.message || err);
          return (
            msg.includes("503") ||
            msg.includes("temporarily down") ||
            err.status === 502
          );
        },
      );

      // Verify in PostgreSQL that processedAt is null and backoff is scheduled
      const row = await orderPrisma.attributionOutboxEvent.findUnique({
        where: { id: outbox2.id },
      });
      assert.equal(row.processedAt, null);
      assert.ok(row.attempts >= 1);
      assert.ok(row.lastError);
      assert.ok(new Date(row.nextAttemptAt).getTime() > Date.now());
    },
  );

  await t.test(
    "Step 5: Sweep recovery: processPendingEvents recovers and delivers backed-off events once recovered",
    async () => {
      // Find the failed event and adjust nextAttemptAt to past
      const pendingBefore = await orderPrisma.attributionOutboxEvent.findFirst({
        where: {
          campaignId: TEST_CAMPAIGN_ID,
          processedAt: null,
        },
      });
      assert.ok(pendingBefore);

      await orderPrisma.attributionOutboxEvent.update({
        where: { id: pendingBefore.id },
        data: {
          nextAttemptAt: new Date(Date.now() - 5000),
        },
      });

      // Restore mock server to 200 OK
      mockHandler = (req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: true,
            deduplicated: false,
            recorded: true,
          }),
        );
      };

      // Run pending sweep
      const sweepResults = await attributionOutboxService.processPendingEvents({
        db: orderPrisma,
        client: productClient,
      });

      assert.ok(sweepResults.length >= 1);
      const recoveredResult = sweepResults.find(
        (r) => r.status === "fulfilled" && r.value?.id === pendingBefore.id,
      );
      assert.ok(recoveredResult);
      const recovered = recoveredResult.value;
      assert.ok(recovered.processedAt);
      assert.ok(recovered.attempts >= 2);
      assert.equal(recovered.lastError, null);

      // Verify in PostgreSQL
      const row = await orderPrisma.attributionOutboxEvent.findUnique({
        where: { id: pendingBefore.id },
      });
      assert.ok(row.processedAt);
      assert.ok(row.attempts >= 2);
      assert.equal(row.lastError, null);
    },
  );

  await t.test(
    "Step 6: Idempotent acknowledgment: handles deduplicated: true without error",
    async () => {
      // Create another order
      const order3 = await orderPrisma.order.create({
        data: {
          buyerId: TEST_BUYER_ID,
          sellerId: TEST_SELLER_ID,
          productId: TEST_PRODUCT_ID,
          productTitle: "Attribution Dedupe Order",
          price: 1000,
          campaignId: TEST_CAMPAIGN_ID,
          campaignCode: "ATTR_PROMO_500",
          discountAmount: 100,
          finalPrice: 900,
          status: "shipped",
        },
      });

      const transitionResult = await orderModel.transitionStatusWithProductSync(
        {
          id: order3.id,
          status: "completed",
          expectedVersion: order3.version,
          expectedStatuses: ["shipped"],
          productSync: {
            dedupeKey: `sync:${order3.id}:1`,
            action: "SET_STATUS",
            productId: TEST_PRODUCT_ID,
            targetStatus: "sold",
          },
        },
      );

      const outbox3 = transitionResult.attributionEvent;

      // Mock returns deduplicated
      mockHandler = (req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, deduplicated: true }));
      };

      const result = await attributionOutboxService.processEvent(outbox3.id, {
        db: orderPrisma,
        client: productClient,
      });

      assert.ok(result.processedAt);
      assert.ok(result.attempts >= 1);
      assert.equal(result.lastError, null);
    },
  );
});
