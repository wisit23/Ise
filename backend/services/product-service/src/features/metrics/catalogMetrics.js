const prisma = require("../../models/prismaClient");

/**
 * Catalog-side metrics for the Executive dashboard.
 * - newListings / soldListings are bucketed to [from, to) like the other
 *   executive endpoints (created / marked-sold within the window).
 * - activeListings is a live gauge (currently `available`), not window-
 *   bucketed — there is no history of past availability to look back on.
 */
async function getCatalogMetrics({ from, to }) {
  const [newListings, soldListings, activeListings] = await Promise.all([
    prisma.product.count({ where: { createdAt: { gte: from, lt: to } } }),
    prisma.product.count({
      where: { status: "sold", updatedAt: { gte: from, lt: to } },
    }),
    prisma.product.count({ where: { status: "available" } }),
  ]);

  return { newListings, soldListings, activeListings };
}

module.exports = { getCatalogMetrics };
