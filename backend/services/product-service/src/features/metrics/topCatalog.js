const prisma = require("../../models/prismaClient");
const orderSalesClient = require("./orderSalesClient");

/**
 * Category rankings for the Executive dashboard (CEO-003, CEO-DEC-009).
 *
 * Amounts come from order-service — the completed orders the dashboard's GMV
 * is summed from, at the price the buyer paid — so the rankings add up to the
 * GMV on the same screen. This service adds what it owns: each product's
 * category. A sale is a completed order placed in [from, to), the same
 * bucketing as GMV. Second-hand items sell once, so there is no product
 * ranking; categories are what repeat.
 */

// Sales of a product whose category is unknown (deleted from the catalog, or
// listed without one) are grouped under this id with no label; what to call
// them is for the screen to say.
const UNCATEGORIZED_ID = "__uncategorized__";

// Deterministic order: the main measure first, then the other, then id.
// Without the final tie-break, two categories with identical figures
// could swap places between requests and make the dashboard look unstable.
const byGmv = (a, b) =>
  b.gmv - a.gmv || b.count - a.count || a.id.localeCompare(b.id, "th");
const byCount = (a, b) =>
  b.count - a.count || b.gmv - a.gmv || a.id.localeCompare(b.id, "th");

// Round to 2 decimals after every add so float error cannot accumulate.
const addMoney = (a, b) => Math.round((a + b) * 100) / 100;

async function getCatalogRankings({ from, to, timezone, limit = 10 }) {
  const sales = await orderSalesClient.getProductSales({ from, to, timezone });

  const products = await prisma.product.findMany({
    where: { id: { in: sales.map((s) => s.productId) } },
    select: { id: true, category: true },
  });
  const categoryById = new Map(products.map((p) => [p.id, p.category]));

  const categoryTotals = new Map();
  for (const sale of sales) {
    const category = categoryById.get(sale.productId) || UNCATEGORIZED_ID;
    const total = categoryTotals.get(category) || { count: 0, gmv: 0 };
    total.count += sale.count;
    total.gmv = addMoney(total.gmv, sale.gmv);
    categoryTotals.set(category, total);
  }

  // Everything sold, not just the ranked rows, so shares can be shown against
  // the whole instead of against the ranked categories only.
  const categoryTotal = [...categoryTotals.values()].reduce(
    (sum, t) => ({ count: sum.count + t.count, gmv: addMoney(sum.gmv, t.gmv) }),
    { count: 0, gmv: 0 },
  );

  const rows = [...categoryTotals].map(([category, total]) => ({
    id: category,
    label: category === UNCATEGORIZED_ID ? null : category,
    count: total.count,
    gmv: total.gmv,
  }));

  return {
    // By what buyers paid: feeds the share-of-sales chart.
    categories: [...rows].sort(byGmv).slice(0, limit),
    // By pieces sold: the most popular categories.
    popularCategories: [...rows].sort(byCount).slice(0, limit),
    categoryTotal,
  };
}

module.exports = { getCatalogRankings, UNCATEGORIZED_ID };
