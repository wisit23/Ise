const prisma = require("../../models/prismaClient");
const { DEFAULT_METRIC_TIMEZONE } = require("@reloop/shared");

const SALES_TYPES = ["standard", "campaign", "auction"];

function emptyBreakdown() {
  return Object.fromEntries(
    SALES_TYPES.map((type) => [
      type,
      { sales: 0, grossSales: 0, discount: 0, completedOrders: 0 },
    ]),
  );
}

function classifyRow(row) {
  if (row.orderType === "AUCTION") return "auction";
  if (row.campaignId) return "campaign";
  return "standard";
}

function normaliseGroupedRows(rows = []) {
  const byType = emptyBreakdown();

  for (const row of rows) {
    const type = classifyRow(row);
    const sales = Number(row._sum?.ordersAmount || 0);
    const grossSales = Number(row._sum?.originalAmount || 0);
    const completedOrders = Number(row._count?._all || 0);
    byType[type].sales += sales;
    byType[type].grossSales += grossSales;
    byType[type].discount += Math.max(grossSales - sales, 0);
    byType[type].completedOrders += completedOrders;
  }

  const total = Object.values(byType).reduce(
    (sum, item) => ({
      sales: sum.sales + item.sales,
      grossSales: sum.grossSales + item.grossSales,
      discount: sum.discount + item.discount,
      completedOrders: sum.completedOrders + item.completedOrders,
    }),
    { sales: 0, grossSales: 0, discount: 0, completedOrders: 0 },
  );

  return { total, byType };
}

function comparison(current, previous) {
  const difference = current - previous;
  let percentChange = 0;
  if (previous === 0) percentChange = current === 0 ? 0 : null;
  else percentChange = Number(((difference / previous) * 100).toFixed(1));

  return {
    previous,
    difference,
    percentChange,
    direction: difference > 0 ? "up" : difference < 0 ? "down" : "flat",
  };
}

function withComparisons(current, previous) {
  const attach = (item, previousItem) => ({
    ...item,
    comparison: comparison(item.sales, previousItem.sales),
  });

  return {
    total: attach(current.total, previous.total),
    byType: Object.fromEntries(
      SALES_TYPES.map((type) => [
        type,
        attach(current.byType[type], previous.byType[type]),
      ]),
    ),
  };
}

function createMarketingSalesMetrics(client = prisma) {
  async function groupedSales(from, to) {
    return client.order.groupBy({
      by: ["orderType", "campaignId"],
      where: {
        status: "completed",
        payments: {
          some: {
            paymentStatus: "paid",
            paidAt: { gte: from, lt: to },
          },
        },
      },
      _sum: { ordersAmount: true, originalAmount: true },
      _count: { _all: true },
    });
  }

  async function getSalesDashboard({ from, to }) {
    const duration = to.getTime() - from.getTime();
    const previousFrom = new Date(from.getTime() - duration);
    const previousTo = new Date(from);
    const [currentRows, previousRows] = await Promise.all([
      groupedSales(from, to),
      groupedSales(previousFrom, previousTo),
    ]);

    return {
      ...withComparisons(
        normaliseGroupedRows(currentRows),
        normaliseGroupedRows(previousRows),
      ),
      range: { from, to },
      previousRange: { from: previousFrom, to: previousTo },
      refreshedAt: new Date().toISOString(),
      definition: {
        orderStatus: "completed",
        salesAmount: "ordersAmount",
        timestamp: "payments.paidAt",
        timezone: DEFAULT_METRIC_TIMEZONE,
      },
    };
  }

  return { getSalesDashboard };
}

module.exports = {
  SALES_TYPES,
  classifyRow,
  normaliseGroupedRows,
  comparison,
  createMarketingSalesMetrics,
  getSalesDashboard: createMarketingSalesMetrics().getSalesDashboard,
};
