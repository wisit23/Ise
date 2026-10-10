const test = require("node:test");
const assert = require("node:assert/strict");

const {
  deliver,
  retryDelayMs,
  processEvent,
  processPendingEvents,
  startWorker,
  stopWorker,
} = require("./attributionOutboxService");

test("Attribution Outbox Service Suite", async (t) => {
  t.afterEach(() => {
    stopWorker();
  });

  await t.test(
    "retryDelayMs: scales exponentially with attempts and caps at 60s",
    () => {
      assert.equal(retryDelayMs(0), 1_000);
      assert.equal(retryDelayMs(1), 2_000);
      assert.equal(retryDelayMs(2), 4_000);
      assert.equal(retryDelayMs(3), 8_000);
      assert.equal(retryDelayMs(4), 16_000);
      assert.equal(retryDelayMs(5), 32_000);
      assert.equal(retryDelayMs(6), 60_000);
      assert.equal(retryDelayMs(10), 60_000);
    },
  );

  await t.test(
    "deliver: sends correct event envelope and flat compatibility fields",
    async () => {
      let capturedEvent = null;
      const mockClient = {
        recordOrderCompleted: async (payload) => {
          capturedEvent = payload;
          return { success: true, recorded: true };
        },
      };

      const outboxRecord = {
        id: "evt-uuid-1",
        orderId: "ord-uuid-1",
        campaignId: "camp-uuid-1",
        grossAmount: 1200,
        discountAmount: 200,
        netAmount: 1000,
        completedAt: new Date("2026-08-01T12:00:00.000Z"),
      };

      await deliver(outboxRecord, mockClient);

      assert.ok(capturedEvent);
      assert.equal(capturedEvent.eventId, "evt-uuid-1");
      assert.equal(capturedEvent.eventType, "order.completed.v1");
      assert.equal(capturedEvent.aggregateId, "ord-uuid-1");
      assert.equal(capturedEvent.occurredAt, "2026-08-01T12:00:00.000Z");
      assert.deepEqual(capturedEvent.payload, {
        orderId: "ord-uuid-1",
        campaignId: "camp-uuid-1",
        grossAmount: 1200,
        discountAmount: 200,
        netAmount: 1000,
        completedAt: "2026-08-01T12:00:00.000Z",
      });
      // Flat compatibility fields
      assert.equal(capturedEvent.orderId, "ord-uuid-1");
      assert.equal(capturedEvent.campaignId, "camp-uuid-1");
      assert.equal(capturedEvent.netAmount, 1000);
    },
  );

  await t.test(
    "processEvent: marks event processed upon successful delivery",
    async () => {
      const store = new Map();
      const event = {
        id: "evt-success-1",
        orderId: "ord-1",
        campaignId: "camp-1",
        grossAmount: 1000,
        discountAmount: 100,
        netAmount: 900,
        completedAt: new Date(),
        attempts: 0,
        lastError: null,
        processedAt: null,
      };
      store.set(event.id, event);

      const mockDb = {
        attributionOutboxEvent: {
          findUnique: async ({ where }) => store.get(where.id) || null,
          updateMany: async ({ where, data }) => {
            const item = store.get(where.id);
            if (
              item &&
              (!where.processedAt || item.processedAt === where.processedAt)
            ) {
              if (data.attempts?.increment)
                item.attempts += data.attempts.increment;
              if (data.lastError !== undefined) item.lastError = data.lastError;
              if (data.processedAt !== undefined)
                item.processedAt = data.processedAt;
              return { count: 1 };
            }
            return { count: 0 };
          },
        },
      };

      let delivered = false;
      const mockClient = {
        recordOrderCompleted: async () => {
          delivered = true;
          return { success: true };
        },
      };

      const result = await processEvent(event.id, {
        db: mockDb,
        client: mockClient,
        now: new Date("2026-08-01T15:00:00.000Z"),
      });

      assert.equal(delivered, true);
      assert.equal(result.attempts, 1);
      assert.equal(result.lastError, null);
      assert.ok(result.processedAt);

      // Second call should be a no-op (idempotent, does not deliver again)
      delivered = false;
      const secondResult = await processEvent(event.id, {
        db: mockDb,
        client: mockClient,
      });
      assert.equal(delivered, false);
      assert.ok(secondResult.processedAt);
    },
  );

  await t.test(
    "processEvent: records error and schedules exponential backoff on delivery failure",
    async () => {
      const store = new Map();
      const event = {
        id: "evt-fail-1",
        orderId: "ord-fail-1",
        campaignId: "camp-1",
        grossAmount: 500,
        discountAmount: 50,
        netAmount: 450,
        completedAt: new Date(),
        attempts: 1,
        lastError: null,
        processedAt: null,
      };
      store.set(event.id, event);

      let nextAttemptTime = null;
      const mockDb = {
        attributionOutboxEvent: {
          findUnique: async ({ where }) => store.get(where.id) || null,
          updateMany: async ({ where, data }) => {
            const item = store.get(where.id);
            if (item) {
              if (data.attempts?.increment)
                item.attempts += data.attempts.increment;
              if (data.lastError) item.lastError = data.lastError;
              if (data.nextAttemptAt) nextAttemptTime = data.nextAttemptAt;
              return { count: 1 };
            }
            return { count: 0 };
          },
        },
      };

      const mockClient = {
        recordOrderCompleted: async () => {
          throw new Error("product-service connection refused 503");
        },
      };

      const baseNow = new Date("2026-08-01T10:00:00.000Z");
      await assert.rejects(
        () =>
          processEvent(event.id, {
            db: mockDb,
            client: mockClient,
            now: baseNow,
          }),
        /product-service connection refused 503/,
      );

      assert.equal(event.attempts, 2);
      assert.match(event.lastError, /503/);
      assert.equal(event.processedAt, null);
      // Attempt 1 -> retry delay 2000ms
      assert.equal(nextAttemptTime.getTime(), baseNow.getTime() + 2_000);
    },
  );

  await t.test(
    "processPendingEvents: processes batch of pending events",
    async () => {
      const store = new Map([
        [
          "evt-p-1",
          {
            id: "evt-p-1",
            orderId: "o-1",
            campaignId: "c-1",
            grossAmount: 100,
            discountAmount: 10,
            netAmount: 90,
            attempts: 0,
            processedAt: null,
            nextAttemptAt: new Date("2026-08-01T10:00:00Z"),
          },
        ],
        [
          "evt-p-2",
          {
            id: "evt-p-2",
            orderId: "o-2",
            campaignId: "c-2",
            grossAmount: 200,
            discountAmount: 20,
            netAmount: 180,
            attempts: 0,
            processedAt: null,
            nextAttemptAt: new Date("2026-08-01T10:00:00Z"),
          },
        ],
      ]);

      const deliveredIds = [];
      const mockDb = {
        attributionOutboxEvent: {
          findMany: async () => Array.from(store.values()),
          findUnique: async ({ where }) => store.get(where.id),
          updateMany: async ({ where, data }) => {
            const item = store.get(where.id);
            if (item) {
              Object.assign(item, data);
              return { count: 1 };
            }
            return { count: 0 };
          },
        },
      };

      const mockClient = {
        recordOrderCompleted: async (payload) => {
          deliveredIds.push(payload.eventId);
          return { success: true };
        },
      };

      const results = await processPendingEvents({
        db: mockDb,
        client: mockClient,
        now: new Date("2026-08-01T10:05:00Z"),
      });

      assert.equal(results.length, 2);
      assert.equal(deliveredIds.length, 2);
      assert.ok(deliveredIds.includes("evt-p-1"));
      assert.ok(deliveredIds.includes("evt-p-2"));
    },
  );

  await t.test(
    "startWorker & stopWorker: starts and cleanly shuts down worker timer",
    () => {
      const mockDb = {
        attributionOutboxEvent: {
          findMany: async () => [],
        },
      };
      const mockClient = {
        recordOrderCompleted: async () => ({ success: true }),
      };
      const timer = startWorker({
        intervalMs: 60_000,
        db: mockDb,
        client: mockClient,
      });
      assert.ok(timer);
      stopWorker();
    },
  );

  await t.test(
    "durability: fails loudly when db or attributionOutboxEvent model is unavailable",
    async () => {
      const badDb = {};
      await assert.rejects(
        () => processEvent("evt-1", { db: badDb }),
        /attributionOutboxEvent model is required on Prisma client/,
      );
      await assert.rejects(
        () => processPendingEvents({ db: badDb }),
        /attributionOutboxEvent model is required on Prisma client/,
      );
      await assert.rejects(
        () =>
          require("./attributionOutboxService").findPendingForOrder(
            "ord-1",
            badDb,
          ),
        /attributionOutboxEvent model is required on Prisma client/,
      );
    },
  );
});
