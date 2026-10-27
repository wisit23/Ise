import {
  parseOverviewMetrics,
  parseRankings,
  parseOrderStatusCounts,
} from "./executiveMetricsPayload";

test("accepts genuine zero metrics while rejecting missing or invalid financial fields", () => {
  const metrics = {
    gmv: 0,
    gmvPurchase: 0,
    gmvAuction: 0,
    platformRevenue: 0,
    completedOrders: 0,
  };
  expect(parseOverviewMetrics(metrics)).toEqual(metrics);
  for (const value of [
    null,
    {},
    { ...metrics, gmv: "100" },
    { ...metrics, gmvAuction: -1 },
    { ...metrics, completedOrders: 1.5 },
  ]) {
    expect(parseOverviewMetrics(value)).toBeNull();
  }
});

test("malformed category rankings become unavailable instead of crashing chart rendering", () => {
  const rankings = {
    categories: [],
    popularCategories: [],
    categoryTotal: { count: 0, gmv: 0 },
  };
  expect(parseRankings(rankings)).toEqual(rankings);
  expect(parseRankings({ ...rankings, popularCategories: {} })).toBeNull();
  expect(
    parseRankings({
      ...rankings,
      categories: [{ id: "category", label: {}, count: 1, gmv: 100 }],
    }),
  ).toBeNull();
  expect(
    parseRankings({ ...rankings, categoryTotal: { count: -1, gmv: 0 } }),
  ).toBeNull();
});

test("order status totals must be integer counts consistent with the displayed groups", () => {
  expect(
    parseOrderStatusCounts({
      completed: 2,
      inProgress: 3,
      disputeRefund: 1,
      total: 6,
    }),
  ).toEqual({ completed: 2, inProgress: 3, disputeRefund: 1, total: 6 });
  expect(
    parseOrderStatusCounts({
      completed: 2,
      inProgress: 3,
      disputeRefund: 1,
      total: 99,
    }),
  ).toBeNull();
  expect(
    parseOrderStatusCounts({
      completed: "2",
      inProgress: 3,
      disputeRefund: 1,
      total: 6,
    }),
  ).toBeNull();
});
