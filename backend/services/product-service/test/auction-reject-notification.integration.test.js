const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

if (process.env.DATABASE_URL_PRODUCT) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_PRODUCT;
}

const prisma = require("../src/models/prismaClient");
const auctionService = require("../src/features/auctions/auctionService");
const chatClient = require("../src/features/auctions/chatClient");

test("reject records one decision and retries the same seller notification without duplication", async (t) => {
  await prisma.$queryRaw`SELECT 1`;
  const productId = randomUUID();
  const auctionId = randomUUID();
  const sellerId = `reject-fixture-seller-${randomUUID()}`;
  const deliveries = [];

  t.mock.method(chatClient, "notifyItemRejected", async (payload) => {
    deliveries.push(payload);
    return { deliveredCount: 1, failedCount: 0, warnings: [] };
  });
  t.after(async () => {
    await prisma.marketingAuditLog.deleteMany({
      where: { entityType: "AUCTION_ITEM", entityId: auctionId },
    });
    await prisma.auctionItem.deleteMany({ where: { id: auctionId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.$disconnect();
  });

  await prisma.product.create({
    data: {
      id: productId,
      title: "Reject notification fixture",
      price: 500,
      sellerId,
      category: "fixture",
      status: "auction",
    },
  });
  await prisma.auctionItem.create({
    data: {
      id: auctionId,
      productId,
      sellerId,
      startingPrice: 200,
      bidIncrement: 20,
      status: "pending_approval",
    },
  });

  const request = {
    user: { id: "marketing-reject-fixture", role: "MARKETING" },
    auctionId,
    reason: "รายละเอียดสินค้าไม่ครบถ้วน",
  };
  const first = await auctionService.reject(request);
  const retry = await auctionService.reject(request);

  assert.equal(first.status, "rejected");
  assert.equal(first.cancellationReason, request.reason);
  assert.equal(retry.idempotentRetry, true);
  assert.equal(deliveries.length, 2);
  assert.equal(deliveries[0].reason, request.reason);
  assert.equal(deliveries[1].reason, request.reason);
  assert.equal(
    await prisma.marketingAuditLog.count({
      where: { action: "AUCTION_ITEM_REJECT", entityId: auctionId },
    }),
    1,
  );
});
