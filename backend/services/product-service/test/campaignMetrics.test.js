const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createCampaignMetricsService,
} = require("../src/features/campaigns/campaignMetrics");

test("Campaign Metrics, Attribution & Conversion Suite", async (t) => {
  const metricsService = createCampaignMetricsService(
    {
      // Mock prisma client for unit tests
      campaign: {
        findUnique: async ({ where }) => ({
          id: where.id,
          code: "SUMMER_TEST",
          name: "Summer Campaign",
          usedCount: 10, // 10 claimed vouchers
        }),
        findMany: async () => [
          { id: "camp-1", usedCount: 10 },
          { id: "camp-2", usedCount: 5 },
        ],
      },
    },
    { isTestAdapter: true },
  );

  t.beforeEach(() => {
    metricsService.resetMemory();
  });

  await t.test(
    "recordOrderCompletedEvent: ignores orders without campaign",
    async () => {
      const res = await metricsService.recordOrderCompletedEvent({
        eventId: "evt-no-camp",
        orderId: "ord-no-camp",
        campaignId: null,
        grossAmount: 500,
        discountAmount: 0,
        netAmount: 500,
      });
      assert.equal(res.recorded, false);
      assert.equal(res.reason, "no_campaign");
    },
  );

  await t.test(
    "recordOrderCompletedEvent: records attribution and deduplicates retries (idempotency)",
    async () => {
      const event = {
        eventId: "evt-attr-1",
        orderId: "ord-attr-1",
        campaignId: "camp-attr-1",
        grossAmount: 1000,
        discountAmount: 100,
        netAmount: 900,
        completedAt: new Date().toISOString(),
      };

      // First ingestion
      const firstRes = await metricsService.recordOrderCompletedEvent(event);
      assert.equal(firstRes.recorded, true);
      assert.equal(firstRes.deduplicated, undefined);

      // Second ingestion (retry with same eventId)
      const retryRes = await metricsService.recordOrderCompletedEvent(event);
      assert.equal(retryRes.recorded, true);
      assert.equal(retryRes.deduplicated, true);

      // Third ingestion (different eventId but same orderId)
      const dupOrderRes = await metricsService.recordOrderCompletedEvent({
        ...event,
        eventId: "evt-attr-2",
      });
      assert.equal(dupOrderRes.recorded, true);
      assert.equal(dupOrderRes.deduplicated, true);

      // Metrics should only count 1 order!
      const metrics = await metricsService.getCampaignMetrics({
        campaignId: "camp-attr-1",
      });
      assert.equal(metrics.completedOrders, 1);
      assert.equal(metrics.grossRevenue, 1000);
      assert.equal(metrics.totalDiscount, 100);
      assert.equal(metrics.netRevenue, 900);
    },
  );

  await t.test("validateDateRange: rejects invalid date and from > to", () => {
    assert.throws(
      () => metricsService.validateDateRange("invalid-date", null),
      /invalid 'from' date format/i,
    );
    assert.throws(
      () => metricsService.validateDateRange(null, "not-a-date"),
      /invalid 'to' date format/i,
    );
    assert.throws(
      () =>
        metricsService.validateDateRange(
          "2026-06-20T00:00:00Z",
          "2026-06-10T00:00:00Z",
        ),
      /'from' date cannot be after 'to' date/i,
    );
  });

  await t.test(
    "getCampaignMetrics: calculates conversion rate (redeemedCount / claimedCount * 100)",
    async () => {
      // 2 completed orders for camp-1
      await metricsService.recordOrderCompletedEvent({
        eventId: "evt-m-1",
        orderId: "ord-m-1",
        campaignId: "camp-1",
        grossAmount: 500,
        discountAmount: 50,
        netAmount: 450,
        completedAt: "2026-06-15T10:00:00Z",
      });
      await metricsService.recordOrderCompletedEvent({
        eventId: "evt-m-2",
        orderId: "ord-m-2",
        campaignId: "camp-1",
        grossAmount: 700,
        discountAmount: 70,
        netAmount: 630,
        completedAt: "2026-06-15T12:00:00Z",
      });

      const metrics = await metricsService.getCampaignMetrics({
        campaign: {
          id: "camp-1",
          code: "CAMP1",
          name: "Campaign One",
          usedCount: 10,
        },
        campaignId: "camp-1",
      });

      assert.equal(metrics.claimedCount, 10);
      assert.equal(metrics.redeemedCount, 2);
      assert.equal(metrics.completedOrders, 2);
      assert.equal(metrics.grossRevenue, 1200);
      assert.equal(metrics.totalDiscount, 120);
      assert.equal(metrics.netRevenue, 1080);
      // 2 / 10 * 100 = 20%
      assert.equal(metrics.conversionRate, 20);
    },
  );

  await t.test(
    "getCampaignMetrics: returns 0 values for campaign with no orders (no error)",
    async () => {
      const metrics = await metricsService.getCampaignMetrics({
        campaign: {
          id: "camp-empty",
          code: "EMPTY",
          name: "Empty Camp",
          usedCount: 5,
        },
        campaignId: "camp-empty",
      });

      assert.equal(metrics.completedOrders, 0);
      assert.equal(metrics.grossRevenue, 0);
      assert.equal(metrics.totalDiscount, 0);
      assert.equal(metrics.netRevenue, 0);
      assert.equal(metrics.conversionRate, 0);
    },
  );

  await t.test(
    "getOverviewMetrics: aggregates revenue and orders across all campaigns",
    async () => {
      await metricsService.recordOrderCompletedEvent({
        eventId: "evt-ov-1",
        orderId: "ord-ov-1",
        campaignId: "camp-1",
        grossAmount: 1000,
        discountAmount: 100,
        netAmount: 900,
      });
      await metricsService.recordOrderCompletedEvent({
        eventId: "evt-ov-2",
        orderId: "ord-ov-2",
        campaignId: "camp-2",
        grossAmount: 2000,
        discountAmount: 200,
        netAmount: 1800,
      });

      const overview = await metricsService.getOverviewMetrics({});
      assert.equal(overview.completedOrders, 2);
      assert.equal(overview.grossRevenue, 3000);
      assert.equal(overview.totalDiscount, 300);
      assert.equal(overview.netRevenue, 2700);
    },
  );

  await t.test("getSalesTrends: groups metrics by daily series", async () => {
    await metricsService.recordOrderCompletedEvent({
      eventId: "evt-t-1",
      orderId: "ord-t-1",
      campaignId: "camp-1",
      grossAmount: 500,
      discountAmount: 50,
      netAmount: 450,
      completedAt: "2026-06-10T08:00:00Z",
    });
    await metricsService.recordOrderCompletedEvent({
      eventId: "evt-t-2",
      orderId: "ord-t-2",
      campaignId: "camp-1",
      grossAmount: 600,
      discountAmount: 60,
      netAmount: 540,
      completedAt: "2026-06-10T14:00:00Z",
    });
    await metricsService.recordOrderCompletedEvent({
      eventId: "evt-t-3",
      orderId: "ord-t-3",
      campaignId: "camp-1",
      grossAmount: 800,
      discountAmount: 80,
      netAmount: 720,
      completedAt: "2026-06-11T09:00:00Z",
    });

    const trends = await metricsService.getSalesTrends({
      campaignId: "camp-1",
    });
    assert.equal(trends.series.length, 2);
    assert.equal(trends.series[0].date, "2026-06-10");
    assert.equal(trends.series[0].completedOrders, 2);
    assert.equal(trends.series[0].grossRevenue, 1100);
    assert.equal(trends.series[1].date, "2026-06-11");
    assert.equal(trends.series[1].completedOrders, 1);
    assert.equal(trends.series[1].grossRevenue, 800);
  });

  await t.test(
    "Prisma model persistence: records attribution, handles envelope, and deduplicates retries",
    async () => {
      const dbStore = new Map();
      const mockPrisma = {
        campaignAttribution: {
          findFirst: async ({ where }) => {
            const orConditions = where?.OR || [];
            for (const item of dbStore.values()) {
              for (const cond of orConditions) {
                if (cond.eventId && item.eventId === cond.eventId) return item;
                if (cond.orderId && item.orderId === cond.orderId) return item;
              }
            }
            return null;
          },
          create: async ({ data }) => {
            // Check unique constraint violation
            for (const item of dbStore.values()) {
              if (
                item.eventId === data.eventId ||
                item.orderId === data.orderId
              ) {
                const err = new Error("Unique constraint violation");
                err.code = "P2002";
                throw err;
              }
            }
            dbStore.set(data.eventId, { ...data, createdAt: new Date() });
            return dbStore.get(data.eventId);
          },
          findMany: async ({ where }) => {
            let res = Array.from(dbStore.values());
            if (where?.campaignId) {
              res = res.filter((x) => x.campaignId === where.campaignId);
            }
            return res;
          },
        },
      };

      const prismaMetrics = createCampaignMetricsService(mockPrisma);

      // Ingestion with event envelope
      const envelope = {
        eventId: "evt-env-1",
        eventType: "order.completed.v1",
        occurredAt: "2026-07-30T10:00:00.000Z",
        aggregateId: "ord-env-1",
        payload: {
          orderId: "ord-env-1",
          campaignId: "camp-env-1",
          grossAmount: 1500,
          discountAmount: 150,
          netAmount: 1350,
          completedAt: "2026-07-30T10:00:00.000Z",
        },
      };

      const res1 = await prismaMetrics.recordOrderCompletedEvent(envelope);
      assert.equal(res1.recorded, true);
      assert.equal(res1.deduplicated, undefined);
      assert.equal(res1.fact.netAmount, 1350);

      // Exact retry
      const resRetry = await prismaMetrics.recordOrderCompletedEvent(envelope);
      assert.equal(resRetry.recorded, true);
      assert.equal(resRetry.deduplicated, true);

      // Duplicate orderId under new eventId
      const resDupOrder = await prismaMetrics.recordOrderCompletedEvent({
        eventId: "evt-env-2",
        orderId: "ord-env-1",
        campaignId: "camp-env-1",
        grossAmount: 1500,
        discountAmount: 150,
      });
      assert.equal(resDupOrder.recorded, true);
      assert.equal(resDupOrder.deduplicated, true);

      // Verify facts count
      const facts = await prismaMetrics.getAttributionFacts({
        campaignId: "camp-env-1",
      });
      assert.equal(facts.length, 1);
    },
  );

  await t.test(
    "Prisma model persistence: propagates DB errors instead of swallowing",
    async () => {
      const failingPrisma = {
        campaignAttribution: {
          findFirst: async () => null,
          create: async () => {
            const err = new Error("connection to database lost");
            err.code = "ECONNREFUSED";
            throw err;
          },
        },
      };

      const failingMetrics = createCampaignMetricsService(failingPrisma);

      await assert.rejects(
        () =>
          failingMetrics.recordOrderCompletedEvent({
            eventId: "evt-fail",
            orderId: "ord-fail",
            campaignId: "camp-fail",
            grossAmount: 500,
          }),
        /connection to database lost/,
      );
    },
  );

  await t.test(
    "Idempotency conflict: returns 409 Conflict when pre-check finds conflicting attribution fields",
    async () => {
      const memoryService = createCampaignMetricsService(null, {
        isTestAdapter: true,
      });
      await memoryService.recordOrderCompletedEvent({
        eventId: "evt-orig",
        orderId: "ord-orig",
        campaignId: "camp-orig",
        grossAmount: 1000,
        discountAmount: 100,
        netAmount: 900,
        completedAt: "2026-08-01T10:00:00.000Z",
      });

      // Conflicting campaignId
      await assert.rejects(
        () =>
          memoryService.recordOrderCompletedEvent({
            eventId: "evt-orig",
            orderId: "ord-orig",
            campaignId: "camp-DIFFERENT",
            grossAmount: 1000,
            discountAmount: 100,
            netAmount: 900,
            completedAt: "2026-08-01T10:00:00.000Z",
          }),
        (err) => err.status === 409,
      );

      // Conflicting amounts
      await assert.rejects(
        () =>
          memoryService.recordOrderCompletedEvent({
            eventId: "evt-orig-2",
            orderId: "ord-orig", // same orderId
            campaignId: "camp-orig",
            grossAmount: 2000, // different gross
            discountAmount: 100,
            netAmount: 1900,
            completedAt: "2026-08-01T10:00:00.000Z",
          }),
        (err) => err.status === 409,
      );

      // Conflicting completedAt
      await assert.rejects(
        () =>
          memoryService.recordOrderCompletedEvent({
            eventId: "evt-orig",
            orderId: "ord-orig",
            campaignId: "camp-orig",
            grossAmount: 1000,
            discountAmount: 100,
            netAmount: 900,
            completedAt: "2026-09-01T10:00:00.000Z", // different date
          }),
        (err) => err.status === 409,
      );

      // Prisma pre-check conflict
      const dbStore = new Map([
        [
          "evt-prisma-orig",
          {
            eventId: "evt-prisma-orig",
            orderId: "ord-prisma-orig",
            campaignId: "camp-orig",
            grossAmount: 1000,
            discountAmount: 100,
            netAmount: 900,
            completedAt: new Date("2026-08-01T10:00:00.000Z"),
          },
        ],
      ]);
      const mockPrisma = {
        campaignAttribution: {
          findFirst: async ({ where }) => {
            for (const item of dbStore.values()) {
              for (const cond of where?.OR || []) {
                if (cond.eventId && item.eventId === cond.eventId) return item;
                if (cond.orderId && item.orderId === cond.orderId) return item;
              }
            }
            return null;
          },
          create: async () => {
            throw new Error(
              "create should not be called when pre-check finds existing",
            );
          },
        },
      };
      const prismaService = createCampaignMetricsService(mockPrisma);
      await assert.rejects(
        () =>
          prismaService.recordOrderCompletedEvent({
            eventId: "evt-prisma-orig",
            orderId: "ord-prisma-orig",
            campaignId: "camp-CONFLICT",
            grossAmount: 1000,
            discountAmount: 100,
            netAmount: 900,
          }),
        (err) => err.status === 409,
      );
    },
  );

  await t.test(
    "Idempotency conflict & deduplication on P2002 race recovery",
    async () => {
      // Simulate P2002 where findFirst returned null (race condition) and create threw P2002
      let findFirstCallCount = 0;
      const raceExistingFact = {
        eventId: "evt-race",
        orderId: "ord-race",
        campaignId: "camp-race",
        grossAmount: 1000,
        discountAmount: 100,
        netAmount: 900,
        completedAt: new Date("2026-08-01T10:00:00.000Z"),
      };

      const racePrisma = {
        campaignAttribution: {
          findFirst: async () => {
            findFirstCallCount++;
            if (findFirstCallCount === 1) {
              // Pre-check finds nothing due to concurrent race
              return null;
            }
            // Race recovery finds the concurrently inserted fact
            return raceExistingFact;
          },
          create: async () => {
            const err = new Error("Unique constraint violation");
            err.code = "P2002";
            throw err;
          },
        },
      };

      const raceMetrics = createCampaignMetricsService(racePrisma);

      // 1. Identical fields -> deduplicated on P2002 recovery
      const resOk = await raceMetrics.recordOrderCompletedEvent({
        eventId: "evt-race",
        orderId: "ord-race",
        campaignId: "camp-race",
        grossAmount: 1000,
        discountAmount: 100,
        netAmount: 900,
        completedAt: "2026-08-01T10:00:00.000Z",
      });
      assert.equal(resOk.recorded, true);
      assert.equal(resOk.deduplicated, true);

      // 2. Conflicting fields -> 409 Conflict on P2002 recovery
      findFirstCallCount = 0;
      await assert.rejects(
        () =>
          raceMetrics.recordOrderCompletedEvent({
            eventId: "evt-race",
            orderId: "ord-race",
            campaignId: "camp-CONCURRENT-DIFFERENT",
            grossAmount: 1000,
            discountAmount: 100,
            netAmount: 900,
            completedAt: "2026-08-01T10:00:00.000Z",
          }),
        (err) => err.status === 409,
      );
    },
  );

  await t.test(
    "production path: fails loudly if Prisma client lacks campaignAttribution model",
    async () => {
      // 1. Custom client without explicit isTestAdapter/inMemory option defaults to production and fails loudly
      const customClientService = createCampaignMetricsService({});
      await assert.rejects(
        () =>
          customClientService.recordOrderCompletedEvent({
            eventId: "evt-fail-loud",
            orderId: "ord-fail-loud",
            campaignId: "camp-fail-loud",
          }),
        /campaignAttribution model is required on Prisma client in production path/,
      );
      await assert.rejects(
        () =>
          customClientService.getAttributionFacts({
            campaignId: "camp-fail-loud",
          }),
        /campaignAttribution model is required on Prisma client in production path/,
      );

      // 2. Production client missing campaignAttribution fails loudly
      const prodService = createCampaignMetricsService(
        { campaign: {} },
        { isProduction: true },
      );
      await assert.rejects(
        () =>
          prodService.recordOrderCompletedEvent({
            eventId: "evt-fail-loud-2",
            orderId: "ord-fail-loud-2",
            campaignId: "camp-fail-loud-2",
          }),
        /campaignAttribution model is required on Prisma client in production path/,
      );
      await assert.rejects(
        () =>
          prodService.getAttributionFacts({
            campaignId: "camp-fail-loud-2",
          }),
        /campaignAttribution model is required on Prisma client in production path/,
      );
    },
  );

  await t.test(
    "identity conflict: reusing eventId with different orderId returns 409 even when monetary fields match",
    async () => {
      // 1. Pre-check path
      const stored = [];
      const mockPrisma = {
        campaignAttribution: {
          findFirst: async ({ where }) => {
            const or = where.OR || [];
            return (
              stored.find((item) =>
                or.some(
                  (cond) =>
                    (cond.eventId && cond.eventId === item.eventId) ||
                    (cond.orderId && cond.orderId === item.orderId),
                ),
              ) || null
            );
          },
          create: async ({ data }) => {
            stored.push(data);
            return data;
          },
        },
      };

      const service = createCampaignMetricsService(mockPrisma);

      // Record first order
      await service.recordOrderCompletedEvent({
        eventId: "evt-shared-id",
        orderId: "ord-original",
        campaignId: "camp-test",
        grossAmount: 1000,
        discountAmount: 200,
        netAmount: 800,
      });

      // Attempt to reuse same eventId for DIFFERENT orderId with identical monetary fields -> 409
      await assert.rejects(
        () =>
          service.recordOrderCompletedEvent({
            eventId: "evt-shared-id",
            orderId: "ord-DIFFERENT",
            campaignId: "camp-test",
            grossAmount: 1000,
            discountAmount: 200,
            netAmount: 800,
          }),
        (err) => err.status === 409,
      );

      // Same orderId with a NEW eventId and matching fields -> valid deduplicated retry
      const validRetry = await service.recordOrderCompletedEvent({
        eventId: "evt-new-id-retry",
        orderId: "ord-original",
        campaignId: "camp-test",
        grossAmount: 1000,
        discountAmount: 200,
        netAmount: 800,
      });
      assert.equal(validRetry.recorded, true);
      assert.equal(validRetry.deduplicated, true);

      // 2. P2002 race recovery path: reusing eventId with different orderId -> 409
      const existingInDb = {
        eventId: "evt-race-ident",
        orderId: "ord-race-original",
        campaignId: "camp-race",
        grossAmount: 2000,
        discountAmount: 500,
        netAmount: 1500,
        completedAt: new Date("2026-08-01T10:00:00.000Z"),
      };

      const racePrisma = {
        campaignAttribution: {
          findFirst: async () => null, // pre-check sees nothing
          create: async () => {
            const err = new Error("Unique constraint violation");
            err.code = "P2002";
            throw err;
          },
        },
      };

      // Mock findFirst after P2002
      let p2002Checked = false;
      racePrisma.campaignAttribution.findFirst = async () => {
        if (!p2002Checked) {
          p2002Checked = true;
          return null;
        }
        return existingInDb;
      };

      const raceService = createCampaignMetricsService(racePrisma);

      // Reusing eventId with different orderId during P2002 race -> 409 Conflict
      await assert.rejects(
        () =>
          raceService.recordOrderCompletedEvent({
            eventId: "evt-race-ident",
            orderId: "ord-race-DIFFERENT",
            campaignId: "camp-race",
            grossAmount: 2000,
            discountAmount: 500,
            netAmount: 1500,
            completedAt: "2026-08-01T10:00:00.000Z",
          }),
        (err) => err.status === 409,
      );

      // Same orderId with new eventId during P2002 race -> deduplicated OK
      p2002Checked = false;
      const raceRetryOk = await raceService.recordOrderCompletedEvent({
        eventId: "evt-race-NEW",
        orderId: "ord-race-original",
        campaignId: "camp-race",
        grossAmount: 2000,
        discountAmount: 500,
        netAmount: 1500,
        completedAt: "2026-08-01T10:00:00.000Z",
      });
      assert.equal(raceRetryOk.recorded, true);
      assert.equal(raceRetryOk.deduplicated, true);
    },
  );
});
