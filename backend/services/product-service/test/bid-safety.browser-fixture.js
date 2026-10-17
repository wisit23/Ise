// Disposable Browser fixture for bid confirmation UI. Never creates a bid.
const { randomUUID } = require("node:crypto");
const assert = require("node:assert/strict");
const prisma = require("../src/models/prismaClient");

async function main() {
  const [mode, suppliedId] = process.argv.slice(2);

  if (mode === "setup") {
    const id = `e2e-bid-safety-${randomUUID()}`;
    const now = Date.now();
    const productId = `${id}-product`;
    const itemId = `${id}-item`;

    await prisma.auctionRound.create({
      data: {
        id,
        title: id,
        submissionStartsAt: new Date(now - 3 * 60 * 60 * 1000),
        submissionEndsAt: new Date(now - 2 * 60 * 60 * 1000),
        auctionStartsAt: new Date(now - 60 * 60 * 1000),
        auctionEndsAt: new Date(now + 30 * 60 * 1000),
      },
    });
    await prisma.product.create({
      data: {
        id: productId,
        sellerId: `${id}-seller`,
        title: "E2E Bid Safety Test Item",
        price: 100,
        category: "test-fixture",
        status: "auction",
        tags: [],
      },
    });
    await prisma.auctionItem.create({
      data: {
        id: itemId,
        productId,
        sellerId: `${id}-seller`,
        roundId: id,
        status: "open",
        startingPrice: 100,
        bidIncrement: 10,
        scheduledStartAt: new Date(now - 60 * 60 * 1000),
        scheduledEndAt: new Date(now + 30 * 60 * 1000),
      },
    });

    console.log(JSON.stringify({ roundId: id, itemId }));
    return;
  }

  assert.equal(mode, "cleanup");
  assert.match(suppliedId || "", /^e2e-bid-safety-[0-9a-f-]{36}$/);
  const round = await prisma.auctionRound.findUnique({
    where: { id: suppliedId },
    include: { auctions: true },
  });
  assert.ok(round && round.title === suppliedId);
  assert.ok(
    round.auctions.every(
      (item) =>
        item.id === `${suppliedId}-item` &&
        item.productId === `${suppliedId}-product` &&
        !item.winningOrderId,
    ),
  );
  assert.equal(
    await prisma.bid.count({
      where: { auctionId: { in: round.auctions.map((item) => item.id) } },
    }),
    0,
    "Browser verification must not submit a bid",
  );

  await prisma.auctionItem.deleteMany({
    where: { id: { in: round.auctions.map((item) => item.id) } },
  });
  await prisma.product.deleteMany({
    where: { id: `${suppliedId}-product` },
  });
  await prisma.auctionRound.delete({ where: { id: suppliedId } });
  console.log(`Removed only Browser fixture ${suppliedId}`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
