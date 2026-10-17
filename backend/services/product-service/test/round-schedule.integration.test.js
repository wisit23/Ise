const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
if (process.env.DATABASE_URL_PRODUCT) process.env.DATABASE_URL = process.env.DATABASE_URL_PRODUCT;
const prisma = require("../src/models/prismaClient");
const queue = require("../src/jobs/auctionCloseQueue");
const { createRoundScheduleService } = require("../src/features/auctions/roundScheduleService");
const chatClient = require("../src/features/auctions/chatClient");

test("round editing: real PostgreSQL transaction/locks and Redis close jobs", async t => {
  // Deliberately fail rather than silently skip when infrastructure is unavailable.
  await prisma.$queryRaw`SELECT 1`;
  const clock = new Date();
  const at = minutes => new Date(clock.getTime() + minutes * 60000);
  const user = { id: `test-editor-${randomUUID()}`, role: "MARKETING" };
  const roundId = randomUUID();
  const productIds = [randomUUID(), randomUUID(), randomUUID()];
  const itemIds = [randomUUID(), randomUUID(), randomUUID()];
  const deliveries = [];
  const chat = { notifyRoundUpdated: async event => { deliveries.push(event); return { warnings: [] }; } };
  const service = createRoundScheduleService({ chatClient: chat, clock: () => clock });
  t.after(async () => {
    for (const id of itemIds) await queue.cancelClose(id);
    await prisma.marketingAuditLog.deleteMany({ where: { entityType: "AUCTION_ROUND", entityId: roundId } });
    await prisma.bid.deleteMany({ where: { auctionId: { in: itemIds } } });
    await prisma.auctionItem.deleteMany({ where: { id: { in: itemIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.auctionRound.deleteMany({ where: { id: roundId } });
    await queue.closeQueue();
    await prisma.$disconnect();
  });
  await prisma.auctionRound.create({ data: { id: roundId, title: "Round edit isolated fixture",
    submissionStartsAt: at(-180), submissionEndsAt: at(-120), auctionStartsAt: at(-60), auctionEndsAt: at(60) } });
  for (let i = 0; i < itemIds.length; i++) {
    await prisma.product.create({ data: { id: productIds[i], title: `Schedule fixture ${i}`, sellerId: user.id, price: 100, category: "test", tags: [] } });
    await prisma.auctionItem.create({ data: { id: itemIds[i], productId: productIds[i], sellerId: user.id,
      roundId, status: i === 2 ? "closed" : "open", startingPrice: 100, bidIncrement: 10,
      scheduledStartAt: at(-60), scheduledEndAt: at(i === 0 ? 65 : 60), softCloseEndsAt: i === 0 ? at(65) : null } });
  }
  await prisma.bid.create({ data: { auctionId: itemIds[0], bidderId: `test-bidder-${randomUUID()}`, amount: 100, idempotencyKey: randomUUID() } });
  const requestFor = async end => {
    const round = await prisma.auctionRound.findUnique({ where: { id: roundId } });
    return { ...Object.fromEntries(["submissionStartsAt", "submissionEndsAt", "auctionStartsAt"].map(field => [field, round[field].toISOString()])),
      auctionEndsAt: end.toISOString(), expectedUpdatedAt: round.updatedAt.toISOString(), idempotencyKey: randomUUID() };
  };
  await t.test("rejects non-Marketing and stale edits without mutation", async () => {
    const input = await requestFor(at(120));
    await assert.rejects(service.updateRound({ user: { ...user, role: "SELLER" }, roundId, input }), err => err.status === 403);
    await assert.rejects(service.updateRound({ user, roundId, input: { ...input, expectedUpdatedAt: at(-1).toISOString() } }), err => err.status === 409);
  });
  await t.test("HTTP route rejects guests, Buyer and Admin, and accepts Marketing", async t => {
    const http = require("node:http");
    const { signAccessToken } = require("@reloop/shared");
    const app = require("../src/app");
    app.locals.validateAccessSession = async () => {};
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const url = `http://127.0.0.1:${server.address().port}/auctions/rounds/${roundId}`;
    const input = await requestFor(at(60));
    assert.equal((await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) })).status, 401);
    for (const role of ["BUYER", "ADMIN", "MARKETING"]) {
      const token = signAccessToken({ sub: user.id, role });
      const response = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(input) });
      assert.equal(response.status, role === "MARKETING" ? 200 : 403);
    }
  });
  let firstInput;
  await t.test("extends items atomically, retains closed rows and schedules Redis jobs", async () => {
    firstInput = await requestFor(at(120));
    const result = await service.updateRound({ user, roundId, input: firstInput });
    assert.deepEqual(result.warnings, []);
    const item = await prisma.auctionItem.findUnique({ where: { id: itemIds[0] } });
    assert.equal(item.scheduledEndAt.getTime(), at(120).getTime());
    assert.equal(item.softCloseEndsAt.getTime(), at(65).getTime());
    const closed = await prisma.auctionItem.findUnique({ where: { id: itemIds[2] } });
    assert.equal(closed.scheduledEndAt.getTime(), at(60).getTime());
    const job = await queue.getQueue().getJob(itemIds[0]);
    assert.equal(await job.getState(), "delayed");
    assert.ok(Math.abs(job.timestamp + job.delay - at(120).getTime()) < 1000);
    assert.equal(deliveries[0].metadata.affectedItems.length, 2);
    assert.equal(deliveries[0].metadata.affectedItems.flatMap(item => item.bidderIds).length, 1);
  });
  await t.test("shortens only to each item's soft-close floor and retries without reverting changes", async () => {
    await service.updateRound({ user, roundId, input: await requestFor(at(30)) });
    assert.equal((await prisma.auctionItem.findUnique({ where: { id: itemIds[0] } })).scheduledEndAt.getTime(), at(65).getTime());
    assert.equal((await prisma.auctionItem.findUnique({ where: { id: itemIds[1] } })).scheduledEndAt.getTime(), at(30).getTime());
    const before = await prisma.marketingAuditLog.count({ where: { entityId: roundId } });
    await service.updateRound({ user, roundId, input: firstInput });
    assert.equal((await prisma.auctionRound.findUnique({ where: { id: roundId } })).auctionEndsAt.getTime(), at(30).getTime());
    assert.equal(await prisma.marketingAuditLog.count({ where: { entityId: roundId } }), before);
    assert.equal(deliveries[0].eventId, deliveries[2].eventId);
    await assert.rejects(service.updateRound({ user, roundId, input: { ...firstInput, auctionEndsAt: at(140).toISOString() } }), err => err.status === 409);
  });
  await t.test("audit failure rolls back round and item updates", async () => {
    const failing = createRoundScheduleService({ chatClient: chat, clock: () => clock,
      recordAudit: async () => { throw new Error("audit fixture failure"); } });
    await assert.rejects(failing.updateRound({ user, roundId, input: await requestFor(at(150)) }), /audit fixture failure/);
    assert.equal((await prisma.auctionRound.findUnique({ where: { id: roundId } })).auctionEndsAt.getTime(), at(30).getTime());
    assert.equal((await prisma.auctionItem.findUnique({ where: { id: itemIds[0] } })).scheduledEndAt.getTime(), at(65).getTime());
  });
  await t.test("an active obsolete close job cannot swallow its newly scheduled future job", async t => {
    const q = queue.getQueue();
    const revisionAt = at(66);
    t.mock.method(q, "getJob", async () => ({ getState: async () => "active" }));
    let added;
    t.mock.method(q, "add", async (...args) => { added = args; });
    await queue.scheduleClose(itemIds[0], revisionAt);
    assert.equal(added[1].auctionId, itemIds[0]);
    assert.equal(added[2].jobId, `${itemIds[0]}-${revisionAt.getTime()}`);
    assert.ok(added[2].delay > 0);
  });
  await t.test("Chat update uses isolated read-only notifications and stable per-recipient keys", async () => {
    const calls = [];
    t.mock.method(global, "fetch", async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      return { ok: true, json: async () => ({ id: "test-notification-room" }) };
    });
    await chatClient.notifyRoundUpdated(deliveries[0]);
    await chatClient.notifyRoundUpdated(deliveries[0]);
    const messages = calls.filter(call => call.url.endsWith("/messages"));
    assert.equal(messages.length, 4);
    assert.equal(messages[0].body.idempotencyKey, messages[2].body.idempotencyKey);
    assert.match(messages[0].body.body, /เริ่มประมูล|ปิดประมูล/);
    assert.match(messages[0].body.body, /เวลาปิดจริง/);
    assert.ok(calls.filter(call => call.url.endsWith("/conversations")).every(call => call.body.contextType === "AUCTION"));
  });
});
