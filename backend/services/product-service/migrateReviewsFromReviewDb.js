// Run after product-service's preserving migration chain has been deployed.
// Idempotent: existing reviews with the same order and id are left untouched.
//
// The legacy Review DB still has the pre-ER shape (`reviews`, `review_photos`,
// `review_videos`), which the current Prisma client no longer models, so the
// source is read with raw SQL. The target is written through the unified
// `review_media` table using the same `image:` / `video:` id prefixes as
// prisma/migrations/20261014000000_approved_er_review_media.
const { PrismaClient } = require("./src/generated/prisma-client");

const BATCH = 100;

async function readBatch(source, cursor) {
  const reviews = await source.$queryRaw`
    SELECT id, order_id AS "orderId", buyer_id AS "buyerId", seller_id AS "sellerId",
           product_id AS "productId", rating, comment, created_at AS "createdAt"
    FROM reviews WHERE id > ${cursor} ORDER BY id ASC LIMIT ${BATCH}`;
  if (reviews.length === 0) return reviews;
  const ids = reviews.map((review) => review.id);
  const [photos, videos] = await Promise.all([
    source.$queryRaw`
      SELECT id, review_id AS "reviewId", url, position, created_at AS "createdAt"
      FROM review_photos WHERE review_id = ANY(${ids}::text[])`,
    source.$queryRaw`
      SELECT id, review_id AS "reviewId", url, position, created_at AS "createdAt"
      FROM review_videos WHERE review_id = ANY(${ids}::text[])`,
  ]);
  return reviews.map((review) => ({
    ...review,
    media: [
      ...photos.filter((m) => m.reviewId === review.id).map((m) => ({ ...m, id: `image:${m.id}`, mediaType: "IMAGE" })),
      ...videos.filter((m) => m.reviewId === review.id).map((m) => ({ ...m, id: `video:${m.id}`, mediaType: "VIDEO" })),
    ],
  }));
}

async function migrateReviews(source, target) {
  const [{ count }] = await source.$queryRaw`SELECT count(*)::int AS count FROM reviews`;
  const sourceTotal = count;
  let cursor = "";
  let migrated = 0;
  let existingCount = 0;
  while (true) {
    const batch = await readBatch(source, cursor);
    if (batch.length === 0) break;
    for (const review of batch) {
      const current = await target.review.findUnique({
        where: { orderId: review.orderId },
        include: { mediaEntries: true },
      });
      if (current) {
        const currentMedia = new Map(current.mediaEntries.map((media) => [media.id, media]));
        const sameReview = ["id", "orderId", "buyerId", "sellerId", "productId", "rating", "comment"]
          .every((key) => current[key] === review[key]) && +current.createdAt === +review.createdAt;
        const sameMedia = currentMedia.size === review.media.length && review.media.every((media) => {
          const stored = currentMedia.get(media.id);
          return stored && stored.mediaType === media.mediaType && stored.url === media.url &&
            stored.position === media.position && +stored.createdAt === +media.createdAt;
        });
        if (
          !sameReview || !sameMedia
        ) {
          throw new Error(`Conflicting review for order ${review.orderId}`);
        }
        existingCount++;
        continue;
      }
      await target.review.create({
        data: {
          id: review.id,
          orderId: review.orderId,
          buyerId: review.buyerId,
          sellerId: review.sellerId,
          productId: review.productId,
          rating: review.rating,
          comment: review.comment,
          createdAt: review.createdAt,
          mediaEntries: {
            create: review.media.map(({ id, mediaType, url, position, createdAt }) => ({
              id,
              mediaType,
              url,
              position,
              createdAt,
            })),
          },
        },
      });
      migrated++;
    }
    cursor = batch.at(-1).id;
  }
  if (migrated + existingCount !== sourceTotal) {
    throw new Error(
      "Source review count changed during migration; stop review writes and retry",
    );
  }
  return { sourceTotal, migrated, existingCount };
}

async function main() {
  require("dotenv").config();
  const sourceUrl = process.env.DATABASE_URL_REVIEW;
  const targetUrl = process.env.DATABASE_URL_PRODUCT;
  if (!sourceUrl || !targetUrl || sourceUrl === targetUrl) {
    throw new Error(
      "Set distinct DATABASE_URL_REVIEW and DATABASE_URL_PRODUCT values",
    );
  }
  const source = new PrismaClient({ datasources: { db: { url: sourceUrl } } });
  const target = new PrismaClient({ datasources: { db: { url: targetUrl } } });
  try {
    const { sourceTotal, migrated, existingCount } = await migrateReviews(source, target);
    console.log(
      `Source reviews: ${sourceTotal}; migrated: ${migrated}; already present: ${existingCount}`,
    );
  } finally {
    await source.$disconnect();
    await target.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { migrateReviews };
