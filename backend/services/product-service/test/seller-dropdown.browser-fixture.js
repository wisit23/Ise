// Disposable, empty round for checking the Seller category UI. No products or jobs.
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const prisma = require("../src/models/prismaClient");

const FIXTURE_PREFIX = "E2E-Dropdown-";
const MINUTE_MS = 60_000;

async function main() {
  const [mode, roundId] = process.argv.slice(2);
  if (mode === "setup") {
    const id = randomUUID();
    const now = Date.now();
    const at = minutes => new Date(now + minutes * MINUTE_MS);
    await prisma.auctionRound.create({ data: {
      id, title: `${FIXTURE_PREFIX}${id}`, maxItems: 1,
      submissionStartsAt: at(-1), submissionEndsAt: at(15),
      auctionStartsAt: at(20), auctionEndsAt: at(30),
    } });
    console.log(JSON.stringify({ roundId: id, title: `${FIXTURE_PREFIX}${id}` }));
    return;
  }
  assert.equal(mode, "cleanup");
  assert.match(roundId || "", /^[0-9a-f-]{36}$/);
  await prisma.$transaction(async tx => {
    const round = await tx.auctionRound.findUnique({ where: { id: roundId } });
    assert.equal(round?.title, `${FIXTURE_PREFIX}${roundId}`);
    assert.equal(await tx.auctionItem.count({ where: { roundId } }), 0);
    assert.equal(await tx.marketingAuditLog.count({ where: { entityType: "AUCTION_ROUND", entityId: roundId } }), 0);
    await tx.auctionRound.delete({ where: { id: roundId } });
  });
  console.log("Removed only empty Seller dropdown fixture " + roundId);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
