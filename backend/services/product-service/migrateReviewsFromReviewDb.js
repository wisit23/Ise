// Run once after product-service's new Prisma schema has been pushed.
// Idempotent: existing reviews with the same order and id are left untouched.
require("dotenv").config();
const { PrismaClient } = require("./src/generated/prisma-client");

const sourceUrl = process.env.DATABASE_URL_REVIEW;
const targetUrl = process.env.DATABASE_URL_PRODUCT;
if (!sourceUrl || !targetUrl || sourceUrl === targetUrl) {
  throw new Error(
    "Set distinct DATABASE_URL_REVIEW and DATABASE_URL_PRODUCT values",
  );
}

const source = new PrismaClient({ datasources: { db: { url: sourceUrl } } });
const target = new PrismaClient({ datasources: { db: { url: targetUrl } } });

async function main() {
  const sourceTotal = await source.review.count();
  let cursor;
  let migrated = 0;
  let existingCount = 0;
  while (true) {
    const batch = await source.review.findMany({
      orderBy: { id: "asc" },
      take: 100,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { photos: true, videos: true },
    });
    if (batch.length === 0) break;
    for (const review of batch) {
      const current = await target.review.findUnique({
        where: { orderId: review.orderId },
        include: { photos: true, videos: true },
      });
      if (current) {
        if (
          current.id !== review.id ||
          current.photos.length !== review.photos.length ||
          current.videos.length !== review.videos.length
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
          photos: {
            create: review.photos.map(({ id, url, position, createdAt }) => ({
              id,
              url,
              position,
              createdAt,
            })),
          },
          videos: {
            create: review.videos.map(({ id, url, position, createdAt }) => ({
              id,
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
  console.log(
    `Source reviews: ${sourceTotal}; migrated: ${migrated}; already present: ${existingCount}`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await source.$disconnect();
    await target.$disconnect();
  });
