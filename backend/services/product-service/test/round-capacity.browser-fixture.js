// Test-only helper for an exact Browser-created round. Never touches business rows.
const assert = require("node:assert/strict");
const prisma = require("../src/models/prismaClient");
const queue = require("../src/jobs/auctionCloseQueue");

async function main() {
  const [mode, title] = process.argv.slice(2);
  assert.match(title || "", /^E2E-Capacity-\d{13}$/);
  const rounds = await prisma.auctionRound.findMany({ where: { title } });
  assert.equal(rounds.length, 1);
  const round = rounds[0];
  assert.equal(round.maxItems, 1);
  const productId = `${round.id}-capacity-product`;
  const sellerId = `${round.id}-capacity-seller`;
  const items = await prisma.auctionItem.findMany({ where: { roundId: round.id } });
  assert.ok(items.every(item => item.productId === productId && item.sellerId === sellerId && !item.winningOrderId));
  if (mode === "fill") {
    assert.ok(items.every(item => ["rejected", "cancelled"].includes(item.status)));
    const existingProduct = await prisma.product.findUnique({ where: { id: productId } });
    assert.ok(!existingProduct || existingProduct.sellerId === sellerId);
    if (!existingProduct) {
      await prisma.product.create({ data: { id: productId, sellerId, title: "Capacity Browser test item",
        price: 100, category: "test-fixture", tags: [] } });
    }
    require("../src/services/sellerActivityClient").recordActivity = () => {};
    const item = await require("../src/features/auctions/auctionService").submit({
      user: { id: sellerId, role: "SELLER" },
      input: { roundId: round.id, productId, startingPrice: 100, bidIncrement: 10 },
    });
    console.log(JSON.stringify({ roundId: round.id, maxItems: round.maxItems, itemId: item.id, status: item.status }));
    return;
  }
  if (mode === "release") {
    assert.equal(items.length, 1);
    await require("../src/features/auctions/auctionService").reject({
      user: { id: `${round.id}-capacity-editor`, role: "MARKETING" }, auctionId: items[0].id,
    });
    console.log("Released fixture slot by rejecting its pending item");
    return;
  }
  assert.equal(mode, "cleanup");
  assert.equal(await prisma.bid.count({ where: { auctionId: { in: items.map(item => item.id) } } }), 0);
  const product = await prisma.product.findUnique({ where: { id: productId } });
  assert.ok(!product || product.sellerId === sellerId);
  for (const item of items) await queue.cancelClose(item.id);
  await prisma.marketingAuditLog.deleteMany({ where: { OR: [
    { entityType: "AUCTION_ROUND", entityId: round.id },
    { entityType: "AUCTION_ITEM", entityId: { in: items.map(item => item.id) } },
  ] } });
  await prisma.auctionItem.deleteMany({ where: { id: { in: items.map(item => item.id) } } });
  await prisma.product.deleteMany({ where: { id: productId } });
  await prisma.auctionRound.delete({ where: { id: round.id } });
  console.log("Removed only Browser fixture " + title);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; })
  .finally(async () => { await queue.closeQueue(); await prisma.$disconnect(); });
