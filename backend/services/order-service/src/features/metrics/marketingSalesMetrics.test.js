const test = require("node:test");
const assert = require("node:assert/strict");
const {
  classifyRow,
  normaliseGroupedRows,
  comparison,
  createMarketingSalesMetrics,
} = require("./marketingSalesMetrics");

test("classifies completed sales without overlap", () => {
  assert.equal(classifyRow({ orderType: "BUY_NOW", campaignId: null }), "standard");
  assert.equal(classifyRow({ orderType: "BUY_NOW", campaignId: "campaign-1" }), "campaign");
  assert.equal(classifyRow({ orderType: "AUCTION", campaignId: "campaign-1" }), "auction");
});

test("normalises grouped amounts into standard, campaign and auction totals", () => {
  const result = normaliseGroupedRows([
    {
      orderType: "BUY_NOW",
      campaignId: null,
      _sum: { ordersAmount: 800, originalAmount: 800 },
      _count: { _all: 2 },
    },
    {
      orderType: "BUY_NOW",
      campaignId: "c1",
      _sum: { ordersAmount: 450, originalAmount: 500 },
      _count: { _all: 1 },
    },
    {
      orderType: "AUCTION",
      campaignId: null,
      _sum: { ordersAmount: 1200, originalAmount: 1200 },
      _count: { _all: 1 },
    },
  ]);

  assert.deepEqual(result.byType.standard, {
    sales: 800,
    grossSales: 800,
    discount: 0,
    completedOrders: 2,
  });
  assert.equal(result.byType.campaign.sales, 450);
  assert.equal(result.byType.campaign.discount, 50);
  assert.equal(result.byType.auction.sales, 1200);
  assert.deepEqual(result.total, {
    sales: 2450,
    grossSales: 2500,
    discount: 50,
    completedOrders: 4,
  });
});

test("comparison handles zero previous values without an infinite percentage", () => {
  assert.deepEqual(comparison(100, 0), {
    previous: 0,
    difference: 100,
    percentChange: null,
    direction: "up",
  });
  assert.equal(comparison(75, 100).percentChange, -25);
});

test("dashboard uses an immediately preceding window of equal length", async () => {
  const calls = [];
  const service = createMarketingSalesMetrics({
    order: {
      groupBy: async (query) => {
        calls.push(query.where.payments.some.paidAt);
        return [];
      },
    },
  });
  const from = new Date("2026-10-12T00:00:00.000Z");
  const to = new Date("2026-10-19T00:00:00.000Z");
  const result = await service.getSalesDashboard({ from, to });

  assert.equal(calls.length, 2);
  assert.equal(calls[1].gte.toISOString(), "2026-10-05T00:00:00.000Z");
  assert.equal(calls[1].lt.toISOString(), from.toISOString());
  assert.equal(result.definition.orderStatus, "completed");
  assert.equal(result.definition.timestamp, "payments.paidAt");
  assert.equal(result.definition.timezone, "Asia/Bangkok");
});
