const prisma = require("./prismaClient");

const WITH_MEDIA = { photos: true, videos: true };

/** Merges photos and videos relations into a single ordered { url, type } array. */
function toApiShape(review) {
  if (!review) return review;
  const { photos, videos, ...rest } = review;
  const media = [
    ...(photos || []).map((p) => ({ ...p, type: "image" })),
    ...(videos || []).map((v) => ({ ...v, type: "video" })),
  ]
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((m) => ({ url: m.url, type: m.type }));
  return { ...rest, media };
}

/** Splits [{ url, type }] into nested create payloads for review_photos and review_videos. */
function mediaToNestedCreate(media) {
  const photos = [];
  const videos = [];
  (media || []).forEach((m, position) => {
    if (m.type === "video") videos.push({ url: m.url, position });
    else photos.push({ url: m.url, position });
  });
  return {
    ...(photos.length ? { photos: { create: photos } } : {}),
    ...(videos.length ? { videos: { create: videos } } : {}),
  };
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
