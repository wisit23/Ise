const prisma = require("./prismaClient");

const WITH_MEDIA = { photos: true, videos: true };

/** Merges the photos/videos relations back into the { url, type } media array
 * shape the API/frontend expects, ordered by `position` (index 0 = cover). */
function toApiShape(product) {
  if (!product) return product;
  const { photos, videos, ...rest } = product;
  const media = [
    ...(photos || []).map((p) => ({ ...p, type: "image" })),
    ...(videos || []).map((v) => ({ ...v, type: "video" })),
  ]
    .sort((a, b) => a.position - b.position)
    .map((m) => ({ url: m.url, type: m.type }));
  return { ...rest, media };
}

/** Splits the incoming { url, type }[] media array into nested Prisma
 * create payloads for the photos/videos tables, preserving submitted order. */
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

async function list({ category, q, status, skip, take } = {}) {
  const where = {
    ...(status ? { status } : { status: { not: "removed" } }),
    ...(category ? { category } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
            { category: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: WITH_MEDIA,
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.product.count({ where }),
  ]);
  return { items: items.map(toApiShape), total };
}

async function listBySeller(sellerId, { status, skip, take } = {}) {
  const where = { sellerId, ...(status ? { status } : {}) };
  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: WITH_MEDIA,
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.product.count({ where }),
  ]);
  return { items: items.map(toApiShape), total };
}

async function findById(id) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: WITH_MEDIA,
  });
  return toApiShape(product);
}

async function create(data) {
  const { media, ...fields } = data;
  const product = await prisma.product.create({
    data: { ...fields, ...mediaToNestedCreate(media) },
    include: WITH_MEDIA,
  });
  return toApiShape(product);
}

async function update(id, patch) {
  const { media, ...fields } = patch;
  try {
    const product = await prisma.$transaction(async (tx) => {
      if (media !== undefined) {
        await tx.photo.deleteMany({ where: { productId: id } });
        await tx.video.deleteMany({ where: { productId: id } });
      }
      return tx.product.update({
        where: { id },
        data: {
          ...fields,
          ...(media !== undefined ? mediaToNestedCreate(media) : {}),
        },
        include: WITH_MEDIA,
      });
    });
    return toApiShape(product);
  } catch (err) {
    if (err.code === "P2025") return null;
    throw err;
  }
}

async function remove(id) {
  try {
    await prisma.product.delete({ where: { id } });
    return true;
  } catch (err) {
    if (err.code === "P2025") return false;
    throw err;
  }
}

function listCategories() {
  return prisma.category.findMany({ orderBy: { name: "asc" } });
}

/** Inserts the category if it's not already known — this is how free-text
 * category entry from the seller still ends up as real, queryable data. */
async function ensureCategory(name) {
  await prisma.category.upsert({
    where: { name },
    update: {},
    create: { name },
  });
}

function listConditions() {
  return prisma.condition.findMany({ orderBy: { sortOrder: "asc" } });
}

/** Swipe feed ("ปัดดูสินค้า") — newest review clips first, only for products
 * still on sale (no point swiping into a clip whose item is already sold). */
async function listVideoFeed({ skip, take } = {}) {
  const where = { product: { status: { not: "removed" } } };
  const [items, total] = await Promise.all([
    prisma.productVideo.findMany({
      where,
      include: { product: true },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.productVideo.count({ where }),
  ]);
  return { items, total };
}

function createVideoClip(data) {
  return prisma.productVideo.create({ data, include: { product: true } });
}

module.exports = {
  list,
  listBySeller,
  findById,
  create,
  update,
  remove,
  listCategories,
  ensureCategory,
  listConditions,
  listVideoFeed,
  createVideoClip,
};
