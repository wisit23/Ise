const prisma = require("../../models/prismaClient");

/**
 * Catalog rankings for the Executive dashboard (CEO-003).
 *
 * Ranked from this service's own sold-product facts — product-service owns
 * both `category` and `price`, so "which category sells best" needs no
 * cross-service join (CEO-DEC-003 forbids reading another service's database).
 *
 * A sale is a product whose status reached `sold` with `updatedAt` inside
 * [from, to) — the same bucketing `catalogMetrics.soldListings` uses, so the
 * ranking always sums to the soldListings KPI on the same dashboard.
 */

// Deterministic order: revenue first, then units, then label. Without the
// final label tie-break, two categories with identical gmv+count could swap
// places between requests and make the dashboard look unstable.
function rankRows(rows) {
  return rows.sort(
    (a, b) =>
      b.gmv - a.gmv ||
      b.count - a.count ||
      a.label.localeCompare(b.label, "th"),
  );
}

async function getTopCategories({ from, to, limit = 10 }) {
  const grouped = await prisma.product.groupBy({
    by: ["category"],
    where: { status: "sold", updatedAt: { gte: from, lt: to } },
    _sum: { price: true },
    _count: { _all: true },
  });

  const rows = grouped.map((row) => ({
    id: row.category,
    label: row.category,
    count: row._count._all,
    gmv: row._sum.price ?? 0,
  }));

  return rankRows(rows).slice(0, limit);
}

async function getTopProducts({ from, to, limit = 10 }) {
  const products = await prisma.product.findMany({
    where: { status: "sold", updatedAt: { gte: from, lt: to } },
    select: { id: true, title: true, price: true, category: true },
  });

  // A second-hand listing sells exactly once, so each row is one sale —
  // count is always 1 and the ranking is effectively by price. Kept in the
  // same {id,label,count,gmv} shape as categories so the UI renders both
  // lists with one component.
  const rows = products.map((p) => ({
    id: p.id,
    label: p.title,
    category: p.category,
    count: 1,
    gmv: p.price,
  }));

  return rankRows(rows).slice(0, limit);
}

async function getCatalogRankings({ from, to, limit = 10 }) {
  const [categories, products] = await Promise.all([
    getTopCategories({ from, to, limit }),
    getTopProducts({ from, to, limit }),
  ]);

  return { categories, products };
}

module.exports = { getCatalogRankings, getTopCategories, getTopProducts };
