const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createCampaignMetricsService,
} = require("../src/features/campaigns/campaignMetrics");

test("Campaign Metrics, Attribution & Conversion Suite", async (t) => {
  const metricsService = createCampaignMetricsService({
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
  });

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
});
