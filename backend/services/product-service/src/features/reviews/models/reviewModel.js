const prisma = require("../../../models/prismaClient");

const WITH_MEDIA = { mediaEntries: { orderBy: [{ position: "asc" }, { mediaType: "asc" }, { id: "asc" }] } };

/** Keep the public ordered { url, type } contract over the unified ER table. */
function toApiShape(review) {
  if (!review) return review;
  const { mediaEntries, ...rest } = review;
  const media = [...(mediaEntries || [])]
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.mediaType.localeCompare(b.mediaType) || a.id.localeCompare(b.id))
    .map((m) => ({ url: m.url, type: m.mediaType === "VIDEO" ? "video" : "image" }));
  return { ...rest, media };
}

function mediaToNestedCreate(media) {
  const entries = (media || []).map((m, position) => ({
    url: m.url,
    position,
    mediaType: m.type === "video" ? "VIDEO" : "IMAGE",
  }));
  return entries.length ? { mediaEntries: { create: entries } } : {};
}

async function create(data) {
  const { media, ...fields } = data;
  const review = await prisma.review.create({
    data: {
      ...fields,
      ...mediaToNestedCreate(media),
    },
    include: WITH_MEDIA,
  });
  return toApiShape(review);
}

async function findByOrderId(orderId) {
  const review = await prisma.review.findUnique({
    where: { orderId },
    include: WITH_MEDIA,
  });
  return toApiShape(review);
}

async function listBySeller(sellerId, { skip, take } = {}) {
  const where = { sellerId };
  const [items, total, aggregate] = await Promise.all([
    prisma.review.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: WITH_MEDIA,
    }),
    prisma.review.count({ where }),
    prisma.review.aggregate({ where, _avg: { rating: true } }),
  ]);
  return {
    items: items.map(toApiShape),
    total,
    averageRating: aggregate._avg.rating || 0,
  };
}

/** Cheap summary for cards/lists that only need the number, not the review list itself. */
async function summaryBySeller(sellerId) {
  const [total, aggregate] = await Promise.all([
    prisma.review.count({ where: { sellerId } }),
    prisma.review.aggregate({
      where: { sellerId },
      _avg: { rating: true },
    }),
  ]);
  return { total, averageRating: aggregate._avg.rating || 0 };
}

async function listByBuyer(buyerId, { skip, take } = {}) {
  const where = { buyerId };
  const [items, total] = await Promise.all([
    prisma.review.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: WITH_MEDIA,
    }),
    prisma.review.count({ where }),
  ]);
  return { items: items.map(toApiShape), total };
}

module.exports = {
  create,
  findByOrderId,
  listBySeller,
  summaryBySeller,
  listByBuyer,
  toApiShape,
  mediaToNestedCreate,
};
