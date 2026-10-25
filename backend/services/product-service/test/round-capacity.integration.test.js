const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
if (process.env.DATABASE_URL_PRODUCT) process.env.DATABASE_URL = process.env.DATABASE_URL_PRODUCT;
const prisma = require("../src/models/prismaClient");
const service = require("../src/features/auctions/auctionService");
const repository = require("../src/features/auctions/auctionRepository");
const queue = require("../src/jobs/auctionCloseQueue");
const chat = require("../src/features/auctions/chatClient");
const activity = require("../src/services/sellerActivityClient");

test("round capacity uses real PostgreSQL locks for both submission flows", async t => {
  await prisma.$queryRaw`SELECT 1`;
  t.mock.method(activity, "recordActivity", () => {});
  t.mock.method(chat, "notifyItemCancelled", async () => ({ warnings: [] }));
  t.mock.method(chat, "notifyRoundUpdated", async () => ({ warnings: [] }));
  const marker = `capacity-${randomUUID()}`;
  const seller = { id: marker, role: "SELLER", kycVerified: true };
  const marketing = { id: `${marker}-editor`, role: "MARKETING" };
  const roundIds = [];
  const productIds = [];
  const category = await prisma.category.create({ data: { name: marker } });
  const at = minutes => new Date(Date.now() + minutes * 60000).toISOString();
  t.after(async () => {
    const items = await prisma.auctionItem.findMany({ where: { roundId: { in: roundIds } } });
    for (const item of items) await queue.cancelClose(item.id);
    const createdProducts = await prisma.product.findMany({ where: { sellerId: marker }, select: { id: true } });
    await prisma.marketingAuditLog.deleteMany({ where: { OR: [
      { entityType: "AUCTION_ROUND", entityId: { in: roundIds } },
      { entityType: "AUCTION_ITEM", entityId: { in: items.map(item => item.id) } },
    ] } });
    await prisma.auctionItem.deleteMany({ where: { id: { in: items.map(item => item.id) } } });
    await prisma.product.deleteMany({ where: { id: { in: createdProducts.map(product => product.id) } } });
    await prisma.auctionRound.deleteMany({ where: { id: { in: roundIds } } });
    await prisma.category.delete({ where: { id: category.id } });
    await queue.closeQueue();
    await prisma.$disconnect();
  });
  const createRound = async maxItems => {
    // createRound refuses a past submission start; create it ahead, then backdate.
    const created = await service.createRound({ user: marketing, input: { title: marker, maxItems,
      submissionStartsAt: at(1), submissionEndsAt: at(60), auctionStartsAt: at(120), auctionEndsAt: at(180) } });
    roundIds.push(created.id);
    return prisma.auctionRound.update({ where: { id: created.id }, data: { submissionStartsAt: at(-60) } });
  };
  for (let index = 0; index < 4; index++) {
    const product = await prisma.product.create({ data: { title: `${marker}-${index}`, sellerId: marker,
      price: 100, category: marker, tags: [] } });
    productIds.push(product.id);
  }
  const submitExisting = (roundId, productId) => service.submit({ user: seller,
    input: { roundId, productId, startingPrice: 100, bidIncrement: 10 } });

  const round = await createRound(1);
  await t.test("one free slot admits exactly one concurrent existing-product submission", async () => {
    const results = await Promise.allSettled(productIds.slice(0, 2).map(id => submitExisting(round.id, id)));
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(results.find(result => result.status === "rejected").reason.status, 409);
    assert.equal(await prisma.auctionItem.count({ where: { roundId: round.id } }), 1);
    const loserId = productIds.slice(0, 2).find(id => !results.some(result => result.status === "fulfilled" && result.value.productId === id));
    assert.equal((await prisma.product.findUnique({ where: { id: loserId } })).status, "available");
  });
  await t.test("pending counts immediately; rejection frees a slot; approval keeps the same slot", async () => {
    const item = await prisma.auctionItem.findFirst({ where: { roundId: round.id } });
    let [display] = await repository.addCapacityCounts([round]);
    assert.equal(display.submittedItemCount, 1);
    await service.reject({ user: marketing, auctionId: item.id, reason: "fixture rejection" });
    [display] = await repository.addCapacityCounts([round]);
    assert.equal(display.submittedItemCount, 0);
    const replacement = await submitExisting(round.id, productIds[2]);
    await service.approve({ user: marketing, auctionId: replacement.id });
    [display] = await repository.addCapacityCounts([round]);
    assert.equal(display.submittedItemCount, 1);
    await assert.rejects(submitExisting(round.id, productIds[3]), error => error.status === 409);
    await service.cancel({ user: marketing, auctionId: replacement.id, reason: "isolated capacity test" });
    [display] = await repository.addCapacityCounts([round]);
    assert.equal(display.submittedItemCount, 0);
  });
  await t.test("new product submissions share the lock and rejected inserts leave no orphan product", async () => {
    const newRound = await createRound(1);
    const before = await prisma.product.count({ where: { sellerId: marker } });
    const input = { roundId: newRound.id, title: marker, category: marker, startingPrice: 100, bidIncrement: 10,
      media: Array.from({ length: 4 }, (_, index) => ({ url: `/test-fixture/${marker}/${index}.jpg`, type: "image" })) };
    const results = await Promise.allSettled([service.submit({ user: seller, input }), service.submit({ user: seller, input })]);
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(results.find(result => result.status === "rejected").reason.status, 409);
    assert.equal(await prisma.product.count({ where: { sellerId: marker } }), before + 1);
    assert.equal(await prisma.auctionItem.count({ where: { roundId: newRound.id } }), 1);
  });
  await t.test("mixed existing/new submissions also compete for the same final slot", async () => {
    const mixedRound = await createRound(1);
    const input = { roundId: mixedRound.id, title: marker, category: marker, startingPrice: 100, bidIncrement: 10,
      media: Array.from({ length: 4 }, (_, index) => ({ url: `/test-fixture/${marker}/${index}.jpg`, type: "image" })) };
    const results = await Promise.allSettled([submitExisting(mixedRound.id, productIds[3]), service.submit({ user: seller, input })]);
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(results.find(result => result.status === "rejected").reason.status, 409);
    assert.equal(await prisma.auctionItem.count({ where: { roundId: mixedRound.id } }), 1);
    // Keep the next subtest independent of which submission won the race.
    const item = await prisma.auctionItem.findFirst({ where: { roundId: mixedRound.id } });
    await service.reject({ user: marketing, auctionId: item.id, reason: "fixture rejection" });
  });
  await t.test("legacy rounds remain unlimited and schedule edits retain the configured limit", async () => {
    const legacy = await prisma.auctionRound.create({ data: { title: marker,
      submissionStartsAt: new Date(at(-60)), submissionEndsAt: new Date(at(60)),
      auctionStartsAt: new Date(at(120)), auctionEndsAt: new Date(at(180)) } });
    roundIds.push(legacy.id);
    assert.equal(legacy.maxItems, null);
    await submitExisting(legacy.id, productIds[3]);
    const before = await prisma.auctionRound.findUnique({ where: { id: round.id } });
    const result = await require("../src/features/auctions/roundScheduleService").updateRound({ user: marketing, roundId: round.id,
      input: { ...Object.fromEntries(["submissionStartsAt", "submissionEndsAt", "auctionStartsAt"].map(field => [field, before[field].toISOString()])),
        auctionEndsAt: at(200), expectedUpdatedAt: before.updatedAt.toISOString(), idempotencyKey: randomUUID() } });
    assert.equal(result.maxItems ?? result.round?.maxItems, 1);
  });
});
