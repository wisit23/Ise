// Disposable fixture for manual Browser acceptance. Never targets business rows.
const { randomUUID } = require("node:crypto");
const assert = require("node:assert/strict");
const prisma = require("../src/models/prismaClient");
const queue = require("../src/jobs/auctionCloseQueue");

async function main() {
  const [mode, suppliedId] = process.argv.slice(2);
  if (mode === "setup") {
    const id = `e2e-round-${randomUUID()}`;
    const now = Date.now();
    const at = minutes => new Date(now + minutes * 60000);
    await prisma.auctionRound.create({ data: { id, title: id, submissionStartsAt: at(-180),
      submissionEndsAt: at(-120), auctionStartsAt: at(-60), auctionEndsAt: at(5) } });
    for (let index = 0; index < 2; index++) {
      await prisma.product.create({ data: { id: `${id}-product-${index}`, sellerId: `${id}-seller`,
        title: `E2E test item ${index + 1}`, price: 100, category: "test-fixture", tags: [] } });
      await prisma.auctionItem.create({ data: { id: `${id}-item-${index}`, productId: `${id}-product-${index}`,
        sellerId: `${id}-seller`, roundId: id, status: "open", startingPrice: 100, bidIncrement: 10,
        scheduledStartAt: at(-60), scheduledEndAt: at(5) } });
    }
    // Real bidding code grants the first item's soft-close floor and books its Redis job.
    await require("../src/features/auctions/auctionService").placeBid({
      user: { id: `${id}-buyer`, role: "BUYER" }, auctionId: `${id}-item-0`, amount: 100, idempotencyKey: randomUUID(),
    });
    const localBangkokInput = date => new Date(date.getTime() + 7 * 3600000).toISOString().slice(0, 16);
    console.log(JSON.stringify({ id, extendTo: localBangkokInput(at(25)), shortenTo: localBangkokInput(at(8)) }));
    return;
  }
  assert.match(suppliedId || "", /^e2e-round-[0-9a-f-]{36}$/);
  const round = await prisma.auctionRound.findUnique({ where: { id: suppliedId } });
  assert.ok(round && round.title === suppliedId, "fixture identity must match before accessing or deleting");
  const where = { entityType: "AUCTION_ROUND", entityId: suppliedId, action: "AUCTION_ROUND_UPDATE" };
  if (mode === "inspect" || mode === "retry") {
    const audits = await prisma.marketingAuditLog.findMany({ where, orderBy: { createdAt: "asc" } });
    if (mode === "retry") {
      assert.equal(audits.length, 2);
      const audit = audits[1];
      const result = await require("../src/features/auctions/roundScheduleService").updateRound({
        user: { id: audit.actorId, role: "MARKETING" }, roundId: suppliedId,
        input: { ...audit.metadata.request, expectedUpdatedAt: audit.previousState.updatedAt,
          idempotencyKey: audit.idempotencyKey.split(":").at(-1) },
      });
      assert.equal(result.idempotentRetry, true);
      assert.deepEqual(result.warnings, []);
      assert.equal(await prisma.marketingAuditLog.count({ where }), 2);
    }
    const items = await prisma.auctionItem.findMany({ where: { roundId: suppliedId }, orderBy: { id: "asc" } });
    const jobs = [];
    for (const item of items) {
      const job = await queue.getQueue().getJob(item.id);
      jobs.push({ id: item.id, state: job ? await job.getState() : null, closeAt: job ? new Date(job.timestamp + job.delay) : null });
    }
    console.log(JSON.stringify({ roundEnd: round.auctionEndsAt, audits: audits.length,
      items: items.map(item => ({ id: item.id, end: item.scheduledEndAt, floor: item.softCloseEndsAt })), jobs }));
    return;
  }
  assert.equal(mode, "cleanup");
  const items = await prisma.auctionItem.findMany({ where: { roundId: suppliedId } });
  assert.ok(items.every(item => item.id.startsWith(`${suppliedId}-item-`) && !item.winningOrderId));
  for (const item of items) await queue.cancelClose(item.id);
  await prisma.marketingAuditLog.deleteMany({ where: { entityType: "AUCTION_ROUND", entityId: suppliedId } });
  await prisma.bid.deleteMany({ where: { auctionId: { in: items.map(item => item.id) } } });
  await prisma.auctionItem.deleteMany({ where: { id: { in: items.map(item => item.id) } } });
  await prisma.product.deleteMany({ where: { id: { in: items.map(item => item.productId) } } });
  await prisma.auctionRound.delete({ where: { id: suppliedId } });
  console.log("Removed only fixture " + suppliedId);
}

main().catch(err => { console.error(err.message); process.exitCode = 1; })
  .finally(async () => { await queue.closeQueue(); await prisma.$disconnect(); });
