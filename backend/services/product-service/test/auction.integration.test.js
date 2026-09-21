const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const IORedis = require("ioredis");

process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";
process.env.INTERNAL_SERVICE_TOKEN ||= "test-internal-token";

process.env.DATABASE_URL ||=
  process.env.DATABASE_URL_PRODUCT ||
  "postgresql://reloop:reloop_dev_password@localhost:5432/reloop_product";
if (process.env.DATABASE_URL.includes("@postgres:")) {
  process.env.DATABASE_URL = process.env.DATABASE_URL.replace(
    "@postgres:",
    "@localhost:",
  );
}
const REDIS_URL = (process.env.REDIS_URL || "redis://localhost:6379").replace(
  "@redis:",
  "@localhost:",
);
process.env.REDIS_URL = REDIS_URL;

const { signAccessToken } = require("@reloop/shared");
const prisma = require("../src/models/prismaClient");
const app = require("../src/app");
// This feature suite uses signed identity fixtures; live session enforcement
// is covered separately by account-suspension.integration.test.js.
app.locals.validateAccessSession = async () => {};
const auctionService = require("../src/features/auctions/auctionService");
const auctionRepository = require("../src/features/auctions/auctionRepository");
const orderClient = require("../src/features/auctions/orderClient");
const auctionCloseQueue = require("../src/jobs/auctionCloseQueue");

// Role test tokens
const sellerToken = signAccessToken({
  sub: "seller-auction-test-01",
  role: "SELLER",
  displayName: "Seller Auction Tester",
});

const buyer1Token = signAccessToken({
  sub: "buyer-auction-test-01",
  role: "BUYER",
  displayName: "Buyer One Tester",
});

const buyer2Token = signAccessToken({
  sub: "buyer-auction-test-02",
  role: "BUYER",
  displayName: "Buyer Two Tester",
});

const marketingToken = signAccessToken({
  sub: "marketing-auction-lead-01",
  role: "MARKETING",
  displayName: "Marketing Auction Manager",
});

const adminToken = signAccessToken({
  sub: "admin-auction-eval-01",
  role: "ADMIN",
  displayName: "Admin Decoupled Evaluator",
});

async function checkPostgres() {
  if (!process.env.DATABASE_URL) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

async function checkRedis() {
  const client = new IORedis(REDIS_URL, {
    connectTimeout: 2500,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  try {
    const pong = await client.ping();
    await client.quit();
    return pong === "PONG";
  } catch {
    try {
      client.disconnect();
    } catch {
      // ignore
    }
    return false;
  }
}

test("Auction Core, Concurrency, Soft Close & BullMQ Integration Suite", async (t) => {
  const pgReachable = await checkPostgres();
  const redisReachable = await checkRedis();

  if (!pgReachable || !redisReachable) {
    const missing = [];
    if (!pgReachable) missing.push("PostgreSQL");
    if (!redisReachable) missing.push(`Redis (${REDIS_URL})`);
    const message = `Integration dependencies unreachable: ${missing.join(", ")}`;

    if (process.env.REQUIRE_INTEGRATION === "1") {
      throw new Error(`REQUIRE_INTEGRATION=1 but ${message}`);
    }
    t.skip(message);
    return;
  }

  // Tracking collections for strict cascading cleanup in reverse-dependency order
  const createdBidIds = [];
  const createdAuctionIds = [];
  const createdProductIds = [];
  const createdRoundIds = [];
  let testWorker = null;

  t.after(async () => {
    const cleanupErrors = [];

    // 1. Stop test worker before deleting jobs or database records
    if (testWorker) {
      try {
        await auctionCloseQueue.stopWorker(testWorker);
      } catch (err) {
        cleanupErrors.push(err);
      }
      testWorker = null;
    }

    // 2. Remove delayed jobs from Redis
    for (const auctionId of createdAuctionIds) {
      try {
        await auctionCloseQueue.cancelClose(auctionId);
      } catch (err) {
        cleanupErrors.push(err);
      }
    }

    // 3. Delete database records in strict dependency order:
    // Bid -> AuctionItem -> Product -> AuctionRound
    // Do not rely on onDelete: SetNull, and ensure all test-created records are removed
    try {
      const bidWhere = [];
      if (createdBidIds.length > 0)
        bidWhere.push({ id: { in: createdBidIds } });
      if (createdAuctionIds.length > 0)
        bidWhere.push({ auctionId: { in: createdAuctionIds } });
      if (bidWhere.length > 0) {
        await prisma.bid.deleteMany({
          where: { OR: bidWhere },
        });
      }
    } catch (err) {
      cleanupErrors.push(err);
    }

    try {
      const auctionWhere = [];
      if (createdAuctionIds.length > 0)
        auctionWhere.push({ id: { in: createdAuctionIds } });
      if (createdRoundIds.length > 0)
        auctionWhere.push({ roundId: { in: createdRoundIds } });
      if (createdProductIds.length > 0)
        auctionWhere.push({ productId: { in: createdProductIds } });
      if (auctionWhere.length > 0) {
        await prisma.auctionItem.deleteMany({
          where: { OR: auctionWhere },
        });
      }
    } catch (err) {
      cleanupErrors.push(err);
    }

    if (createdProductIds.length > 0) {
      try {
        await prisma.product.deleteMany({
          where: { id: { in: createdProductIds } },
        });
      } catch (err) {
        cleanupErrors.push(err);
      }
    }

    if (createdRoundIds.length > 0) {
      try {
        await prisma.auctionRound.deleteMany({
          where: { id: { in: createdRoundIds } },
        });
      } catch (err) {
        cleanupErrors.push(err);
      }
    }

    // 4. Close Queue and disconnect Prisma last
    try {
      await auctionCloseQueue.closeQueue();
    } catch (err) {
      cleanupErrors.push(err);
    }

    try {
      await prisma.$disconnect();
    } catch (err) {
      cleanupErrors.push(err);
    }

    if (cleanupErrors.length > 0) {
      throw new Error(
        `Cleanup failed with ${cleanupErrors.length} error(s): ${cleanupErrors.map((e) => e.message || String(e)).join("; ")}`,
      );
    }
  });

  // Helper to create clean product
  async function createTestProduct(
    sellerId,
    title = "Auction Item Test Product",
    status = "available",
  ) {
    const product = await prisma.product.create({
      data: {
        sellerId,
        title: `${title} ${Date.now()}_${Math.random().toString(36).substring(7)}`,
        price: 500,
        category: "apparel",
        brand: "ReloopBrand",
        condition: "Excellent",
        size: "M",
        tags: ["streetwear", "auction"],
        status,
      },
    });
    createdProductIds.push(product.id);
    return product;
  }

  // Helper to create clean round
  async function createTestRound({
    subStartsInMs = -3600000,
    subEndsInMs = 3600000,
    aucStartsInMs = 3600000,
    aucEndsInMs = 7200000,
  } = {}) {
    const now = Date.now();
    const round = await prisma.auctionRound.create({
      data: {
        title: `Test Round ${now}`,
        submissionStartsAt: new Date(now + subStartsInMs),
        submissionEndsAt: new Date(now + subEndsInMs),
        auctionStartsAt: new Date(now + aucStartsInMs),
        auctionEndsAt: new Date(now + aucEndsInMs),
      },
    });
    createdRoundIds.push(round.id);
    return round;
  }

  await t.test(
    "Step 1: Seller submits product to active round -> persists in PostgreSQL with status 'auction'",
    async () => {
      const round = await createTestRound();
      const product = await createTestProduct("seller-auction-test-01");

      const res = await request(app)
        .post("/auctions")
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({
          productId: product.id,
          startingPrice: 200,
          bidIncrement: 20,
        });

      assert.equal(
        res.status,
        201,
        `Expected 201 Created: ${JSON.stringify(res.body)}`,
      );
      assert.equal(res.body.productId, product.id);
      assert.equal(res.body.status, "pending_approval");
      assert.equal(res.body.startingPrice, 200);
      assert.equal(res.body.bidIncrement, 20);
      assert.equal(res.body.roundId, round.id);

      createdAuctionIds.push(res.body.id);

      // Verify Product status transitioned to 'auction' in DB
      const freshProduct = await prisma.product.findUnique({
        where: { id: product.id },
      });
      assert.equal(
        freshProduct.status,
        "auction",
        "Product status must be 'auction' to isolate from regular feed",
      );
    },
  );

  await t.test(
    "Step 2: Admin Decoupling & Marketing Approval -> direct to 'scheduled' and BullMQ booked",
    async () => {
      await createTestRound();
      const product = await createTestProduct("seller-auction-test-01");

      const submitRes = await request(app)
        .post("/auctions")
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({
          productId: product.id,
          startingPrice: 300,
          bidIncrement: 25,
        });
      assert.equal(submitRes.status, 201);
      const auctionId = submitRes.body.id;
      createdAuctionIds.push(auctionId);

      // 1. Admin attempt must be rejected with 403 Forbidden (ADM-DEC-017 / MKT-DEC-014)
      const adminRes = await request(app)
        .patch(`/auctions/${auctionId}/approve`)
        .set("Authorization", `Bearer ${adminToken}`);
      assert.equal(
        adminRes.status,
        403,
        "Admin must not be allowed to approve auctions",
      );

      // 2. Marketing approves -> transitions directly to 'scheduled' because round has start/end dates
      const mktRes = await request(app)
        .patch(`/auctions/${auctionId}/approve`)
        .set("Authorization", `Bearer ${marketingToken}`);
      assert.equal(mktRes.status, 200);
      assert.equal(mktRes.body.status, "scheduled");
      assert.equal(mktRes.body.approvedBy, "marketing-auction-lead-01");
      assert.ok(mktRes.body.approvedAt);

      // Verify PostgreSQL persistence
      const inDb = await prisma.auctionItem.findUnique({
        where: { id: auctionId },
      });
      assert.equal(inDb.status, "scheduled");
      assert.equal(inDb.approvedBy, "marketing-auction-lead-01");

      // 3. Inspect BullMQ delayed close job directly in Redis
      const job = await auctionCloseQueue.getQueue().getJob(auctionId);
      assert.ok(job, "Delayed close job must exist in BullMQ queue");
      assert.equal(job.id, auctionId);
      assert.equal(job.data.auctionId, auctionId);
    },
  );

  await t.test("Step 3: Bidding rules & PostgreSQL persistence", async () => {
    await createTestRound();
    const product = await createTestProduct("seller-auction-test-01");

    const submitRes = await request(app)
      .post("/auctions")
      .set("Authorization", `Bearer ${sellerToken}`)
      .send({
        productId: product.id,
        startingPrice: 100,
        bidIncrement: 10,
      });
    const auctionId = submitRes.body.id;
    createdAuctionIds.push(auctionId);

    await request(app)
      .patch(`/auctions/${auctionId}/approve`)
      .set("Authorization", `Bearer ${marketingToken}`);

    // Advance auction to open in PostgreSQL
    await prisma.auctionItem.update({
      where: { id: auctionId },
      data: {
        status: "open",
        scheduledStartAt: new Date(Date.now() - 10000),
        scheduledEndAt: new Date(Date.now() + 3600000),
      },
    });

    // 1. Seller cannot bid on their own auction (403 Forbidden)
    const selfBidRes = await request(app)
      .post(`/auctions/${auctionId}/bids`)
      .set("Authorization", `Bearer ${sellerToken}`)
      .send({ amount: 150, idempotencyKey: `idem-self-${Date.now()}` });
    assert.equal(selfBidRes.status, 403, "Seller cannot bid on own auction");

    // 2. Bid below startingPrice rejected (400 Bad Request)
    const lowBidRes = await request(app)
      .post(`/auctions/${auctionId}/bids`)
      .set("Authorization", `Bearer ${buyer1Token}`)
      .send({ amount: 90, idempotencyKey: `idem-low-${Date.now()}` });
    assert.equal(
      lowBidRes.status,
      400,
      "Bid below startingPrice must be rejected",
    );

    // 3. Valid first bid (100)
    const bid1Key = `idem-bid1-${Date.now()}`;
    const bid1Res = await request(app)
      .post(`/auctions/${auctionId}/bids`)
      .set("Authorization", `Bearer ${buyer1Token}`)
      .send({ amount: 100, idempotencyKey: bid1Key });
    assert.equal(
      bid1Res.status,
      201,
      `Expected 201: ${JSON.stringify(bid1Res.body)}`,
    );
    assert.equal(bid1Res.body.amount, 100);
    assert.equal(bid1Res.body.bidderId, "buyer-auction-test-01");
    createdBidIds.push(bid1Res.body.id);

    // 4. Bid below highest + bidIncrement (100 + 10 = 110 required; 105 must fail)
    const underIncRes = await request(app)
      .post(`/auctions/${auctionId}/bids`)
      .set("Authorization", `Bearer ${buyer2Token}`)
      .send({ amount: 105, idempotencyKey: `idem-under-${Date.now()}` });
    assert.equal(
      underIncRes.status,
      400,
      "Bid must meet highest + bidIncrement",
    );

    // 5. Valid second bid (110)
    const bid2Key = `idem-bid2-${Date.now()}`;
    const bid2Res = await request(app)
      .post(`/auctions/${auctionId}/bids`)
      .set("Authorization", `Bearer ${buyer2Token}`)
      .send({ amount: 110, idempotencyKey: bid2Key });
    assert.equal(bid2Res.status, 201);
    assert.equal(bid2Res.body.amount, 110);
    createdBidIds.push(bid2Res.body.id);

    // Verify bids table in PostgreSQL
    const bidsInDb = await prisma.bid.findMany({
      where: { auctionId },
      orderBy: { amount: "desc" },
    });
    assert.equal(bidsInDb.length, 2);
    assert.equal(bidsInDb[0].amount, 110);
    assert.equal(bidsInDb[1].amount, 100);
  });

  await t.test(
    "Step 4: Idempotency Key DB constraint prevents duplicate bids on retry",
    async () => {
      await createTestRound();
      const product = await createTestProduct("seller-auction-test-01");

      const submitRes = await request(app)
        .post("/auctions")
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({ productId: product.id, startingPrice: 150, bidIncrement: 10 });
      const auctionId = submitRes.body.id;
      createdAuctionIds.push(auctionId);

      await prisma.auctionItem.update({
        where: { id: auctionId },
        data: {
          status: "open",
          scheduledStartAt: new Date(Date.now() - 10000),
          scheduledEndAt: new Date(Date.now() + 3600000),
        },
      });

      const idemKey = `idem-retry-${Date.now()}`;
      const firstAttempt = await request(app)
        .post(`/auctions/${auctionId}/bids`)
        .set("Authorization", `Bearer ${buyer1Token}`)
        .send({ amount: 150, idempotencyKey: idemKey });
      assert.equal(firstAttempt.status, 201);
      createdBidIds.push(firstAttempt.body.id);

      // 1. Retry with exact same idempotencyKey returns existing bid
      const secondAttempt = await request(app)
        .post(`/auctions/${auctionId}/bids`)
        .set("Authorization", `Bearer ${buyer1Token}`)
        .send({ amount: 150, idempotencyKey: idemKey });

      assert.equal(
        secondAttempt.status,
        201,
        "Idempotent retry must return 201 with existing bid",
      );
      assert.equal(secondAttempt.body.id, firstAttempt.body.id);
      assert.equal(secondAttempt.body.amount, 150);

      // Confirm only 1 bid row exists in PostgreSQL
      const bidRows = await prisma.bid.findMany({
        where: { idempotencyKey: idemKey },
      });
      assert.equal(
        bidRows.length,
        1,
        "Must not create duplicate bid in PostgreSQL",
      );

      // 2. Mismatched amount reuse with same key -> 409 Conflict
      const diffAmountRes = await request(app)
        .post(`/auctions/${auctionId}/bids`)
        .set("Authorization", `Bearer ${buyer1Token}`)
        .send({ amount: 160, idempotencyKey: idemKey });
      assert.equal(
        diffAmountRes.status,
        409,
        "Reusing key with different amount must return 409 Conflict",
      );

      // 3. Mismatched bidder reuse with same key -> 409 Conflict
      const diffBidderRes = await request(app)
        .post(`/auctions/${auctionId}/bids`)
        .set("Authorization", `Bearer ${buyer2Token}`)
        .send({ amount: 150, idempotencyKey: idemKey });
      assert.equal(
        diffBidderRes.status,
        409,
        "Reusing key with different bidder must return 409 Conflict",
      );

      // 4. Mismatched auctionId reuse with same key -> 409 Conflict
      const product2 = await createTestProduct("seller-auction-test-01");
      const submitRes2 = await request(app)
        .post("/auctions")
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({ productId: product2.id, startingPrice: 150, bidIncrement: 10 });
      const auctionId2 = submitRes2.body.id;
      createdAuctionIds.push(auctionId2);
      await prisma.auctionItem.update({
        where: { id: auctionId2 },
        data: {
          status: "open",
          scheduledStartAt: new Date(Date.now() - 10000),
          scheduledEndAt: new Date(Date.now() + 3600000),
        },
      });
      const diffAuctionRes = await request(app)
        .post(`/auctions/${auctionId2}/bids`)
        .set("Authorization", `Bearer ${buyer1Token}`)
        .send({ amount: 150, idempotencyKey: idemKey });
      assert.equal(
        diffAuctionRes.status,
        409,
        "Reusing key with different auction must return 409 Conflict",
      );

      // 5. Retry after auction state changes (e.g. auction closed) -> returns original bid
      await prisma.auctionItem.update({
        where: { id: auctionId },
        data: { status: "closed" },
      });
      const retryAfterClosedRes = await request(app)
        .post(`/auctions/${auctionId}/bids`)
        .set("Authorization", `Bearer ${buyer1Token}`)
        .send({ amount: 150, idempotencyKey: idemKey });
      assert.equal(
        retryAfterClosedRes.status,
        201,
        "Exact retry on closed auction must return original bid",
      );
      assert.equal(retryAfterClosedRes.body.id, firstAttempt.body.id);
    },
  );

  await t.test(
    "Step 5: Concurrent bidding serialized by pg_advisory_xact_lock",
    async () => {
      await createTestRound();
      const product = await createTestProduct("seller-auction-test-01");

      const submitRes = await request(app)
        .post("/auctions")
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({ productId: product.id, startingPrice: 100, bidIncrement: 20 });
      const auctionId = submitRes.body.id;
      createdAuctionIds.push(auctionId);

      await prisma.auctionItem.update({
        where: { id: auctionId },
        data: {
          status: "open",
          scheduledStartAt: new Date(Date.now() - 10000),
          scheduledEndAt: new Date(Date.now() + 3600000),
        },
      });

      // Two buyers simultaneously attempt to bid the exact same amount (100)
      const [resA, resB] = await Promise.all([
        request(app)
          .post(`/auctions/${auctionId}/bids`)
          .set("Authorization", `Bearer ${buyer1Token}`)
          .send({ amount: 100, idempotencyKey: `conc-A-${Date.now()}` }),
        request(app)
          .post(`/auctions/${auctionId}/bids`)
          .set("Authorization", `Bearer ${buyer2Token}`)
          .send({ amount: 100, idempotencyKey: `conc-B-${Date.now()}` }),
      ]);

      // One must win (201 Created), one must be rejected (400 Bad Request) because
      // the advisory lock forces sequential execution: the 2nd sees highest=100, so min is 120!
      const statuses = [resA.status, resB.status].sort();
      assert.deepEqual(
        statuses,
        [201, 400],
        "Concurrent same-amount bids must result in exactly 1 winner and 1 rejection",
      );

      const winnerRes = resA.status === 201 ? resA : resB;
      createdBidIds.push(winnerRes.body.id);

      // Verify in PostgreSQL that only 1 bid was persisted
      const bids = await prisma.bid.findMany({ where: { auctionId } });
      assert.equal(bids.length, 1);
    },
  );

  await t.test(
    "Step 6: Anti-Sniping Soft Close extends scheduledEndAt by +5m in PostgreSQL",
    async () => {
      await createTestRound();
      const product = await createTestProduct("seller-auction-test-01");

      const submitRes = await request(app)
        .post("/auctions")
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({ productId: product.id, startingPrice: 100, bidIncrement: 10 });
      const auctionId = submitRes.body.id;
      createdAuctionIds.push(auctionId);

      // Set scheduledEndAt to 2 minutes from now (within the 5-minute soft close window)
      const initialEndTime = new Date(Date.now() + 2 * 60 * 1000);
      await prisma.auctionItem.update({
        where: { id: auctionId },
        data: {
          status: "open",
          scheduledStartAt: new Date(Date.now() - 10000),
          scheduledEndAt: initialEndTime,
        },
      });

      // Place a bid inside the soft-close window
      const bidRes = await request(app)
        .post(`/auctions/${auctionId}/bids`)
        .set("Authorization", `Bearer ${buyer1Token}`)
        .send({ amount: 100, idempotencyKey: `soft-close-${Date.now()}` });
      assert.equal(bidRes.status, 201);
      createdBidIds.push(bidRes.body.id);

      // Check PostgreSQL: scheduledEndAt must be extended by exactly 5 minutes (300,000ms)
      const updatedAuction = await prisma.auctionItem.findUnique({
        where: { id: auctionId },
      });
      const expectedEndTime = new Date(
        initialEndTime.getTime() + 5 * 60 * 1000,
      );

      const diffMs = Math.abs(
        updatedAuction.scheduledEndAt.getTime() - expectedEndTime.getTime(),
      );
      assert.ok(
        diffMs < 1000,
        `scheduledEndAt should be extended by +5m (diff: ${diffMs}ms)`,
      );

      // Verify BullMQ job delay/timestamp corresponds to updated scheduledEndAt
      const rescheduledJob = await auctionCloseQueue
        .getQueue()
        .getJob(auctionId);
      assert.ok(
        rescheduledJob,
        "Rescheduled close job must exist in BullMQ queue",
      );
      assert.equal(rescheduledJob.id, auctionId);
      assert.ok(
        rescheduledJob.opts.delay > 0,
        "Rescheduled job must have a positive delay",
      );
      const jobExecutionTime =
        rescheduledJob.timestamp + rescheduledJob.opts.delay;
      const timeDiffMs = Math.abs(
        jobExecutionTime - updatedAuction.scheduledEndAt.getTime(),
      );
      assert.ok(
        timeDiffMs < 2000,
        `BullMQ job target execution time (${jobExecutionTime}) must match updated scheduledEndAt (${updatedAuction.scheduledEndAt.getTime()}) within 2s tolerance (actual diff: ${timeDiffMs}ms)`,
      );
    },
  );

  await t.test(
    "Step 7: Auction Close with Winner -> calls Order Client once and records winningOrderId",
    async (t) => {
      await createTestRound();
      const product = await createTestProduct("seller-auction-test-01");

      const submitRes = await request(app)
        .post("/auctions")
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({ productId: product.id, startingPrice: 200, bidIncrement: 20 });
      const auctionId = submitRes.body.id;
      createdAuctionIds.push(auctionId);

      // Open and bid
      await prisma.auctionItem.update({
        where: { id: auctionId },
        data: {
          status: "open",
          scheduledStartAt: new Date(Date.now() - 60000),
          scheduledEndAt: new Date(Date.now() - 1000), // expired
        },
      });

      const bid = await prisma.bid.create({
        data: {
          auctionId,
          bidderId: "buyer-auction-test-01",
          amount: 250,
          idempotencyKey: `idem-win-${Date.now()}`,
        },
      });
      createdBidIds.push(bid.id);

      // Mock orderClient.createOrderFromAuction (Product-Service outgoing contract)
      let orderClientCallCount = 0;
      let orderClientPayload = null;
      t.mock.method(orderClient, "createOrderFromAuction", async (payload) => {
        orderClientCallCount++;
        orderClientPayload = payload;
        return { id: "order-winner-mock-789" };
      });

      // Trigger close via maybeAdvance / get
      const closedAuction = await auctionService.get(auctionId);

      assert.equal(closedAuction.status, "closed");
      assert.equal(closedAuction.winningBidId, bid.id);
      assert.equal(closedAuction.winningOrderId, "order-winner-mock-789");
      assert.equal(
        orderClientCallCount,
        1,
        "Order Client must be called exactly once",
      );
      assert.equal(orderClientPayload.auctionId, auctionId);
      assert.equal(orderClientPayload.buyerId, "buyer-auction-test-01");
      assert.equal(orderClientPayload.price, 250);
    },
  );

  await t.test(
    "Step 8: Real BullMQ delayed worker execution & idempotent re-close prevents duplicate orders",
    async (t) => {
      await createTestRound();
      const product = await createTestProduct("seller-auction-test-01");

      const submitRes = await request(app)
        .post("/auctions")
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({ productId: product.id, startingPrice: 200, bidIncrement: 20 });
      const auctionId = submitRes.body.id;
      createdAuctionIds.push(auctionId);

      // Schedule to close in 1.2 seconds
      const closeAt = new Date(Date.now() + 1200);
      await prisma.auctionItem.update({
        where: { id: auctionId },
        data: {
          status: "open",
          scheduledStartAt: new Date(Date.now() - 60000),
          scheduledEndAt: closeAt,
        },
      });

      const bid = await prisma.bid.create({
        data: {
          auctionId,
          bidderId: "buyer-auction-test-01",
          amount: 200,
          idempotencyKey: `idem-step8-${Date.now()}`,
        },
      });
      createdBidIds.push(bid.id);

      // 1. Schedule close job in BullMQ and verify it exists
      await auctionCloseQueue.scheduleClose(auctionId, closeAt);
      const scheduledJob = await auctionCloseQueue.getQueue().getJob(auctionId);
      assert.ok(
        scheduledJob,
        "BullMQ delayed close job must exist before worker runs",
      );
      assert.equal(scheduledJob.id, auctionId);

      // 2. Mock orderClient (outgoing contract)
      let orderClientCalls = 0;
      let orderClientPayload = null;
      t.mock.method(orderClient, "createOrderFromAuction", async (payload) => {
        orderClientCalls++;
        orderClientPayload = payload;
        return { id: "order-step8-mock" };
      });

      // 3. Start real BullMQ worker
      testWorker = auctionCloseQueue.startWorker(auctionService.get);

      // 4. Poll PostgreSQL with a bounded timeout (max 5s, every 100ms) until closed
      const pollStart = Date.now();
      let closedDbItem = null;
      while (Date.now() - pollStart < 5000) {
        const item = await prisma.auctionItem.findUnique({
          where: { id: auctionId },
        });
        if (item && item.status === "closed") {
          closedDbItem = item;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // 5. Verify worker executed and closed auction in DB with winner
      assert.ok(
        closedDbItem,
        "Auction must be closed by BullMQ worker within timeout",
      );
      assert.equal(closedDbItem.status, "closed");
      assert.equal(closedDbItem.winningBidId, bid.id);
      assert.equal(closedDbItem.winningOrderId, "order-step8-mock");
      assert.equal(
        orderClientCalls,
        1,
        "BullMQ worker must invoke Order Client exactly once",
      );
      assert.equal(orderClientPayload?.auctionId, auctionId);
      assert.equal(orderClientPayload?.buyerId, "buyer-auction-test-01");
      assert.equal(orderClientPayload?.price, 200);

      // 6. Trigger/read closed auction again and verify idempotent re-close
      const reclosed = await auctionService.get(auctionId);
      assert.equal(reclosed.status, "closed");
      assert.equal(
        orderClientCalls,
        1,
        "Idempotent re-close must not invoke order client again",
      );

      // 7. Stop worker cleanly
      await auctionCloseQueue.stopWorker(testWorker);
      testWorker = null;
    },
  );

  await t.test(
    "Step 9: No-bid Auction close reverts product status to 'available'",
    async () => {
      await createTestRound();
      const product = await createTestProduct("seller-auction-test-01");

      const submitRes = await request(app)
        .post("/auctions")
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({ productId: product.id, startingPrice: 300, bidIncrement: 30 });
      const auctionId = submitRes.body.id;
      createdAuctionIds.push(auctionId);

      // Set to expired open auction with NO bids
      await prisma.auctionItem.update({
        where: { id: auctionId },
        data: {
          status: "open",
          scheduledStartAt: new Date(Date.now() - 60000),
          scheduledEndAt: new Date(Date.now() - 1000),
        },
      });

      const closed = await auctionService.get(auctionId);
      assert.equal(closed.status, "closed");
      assert.equal(closed.winningBidId, null);
      assert.equal(closed.winningOrderId, null);

      // Verify Product status reverted back to 'available' in PostgreSQL
      const freshProduct = await prisma.product.findUnique({
        where: { id: product.id },
      });
      assert.equal(
        freshProduct.status,
        "available",
        "No-bid auction close must return product to available",
      );
    },
  );

  await t.test(
    "Step 10: Auction Round Overlap Protection, Concurrency & Deterministic Selection",
    async () => {
      // Determine safe future range after max existing auctionEndsAt to avoid colliding with seed data
      const maxRound = await prisma.auctionRound.aggregate({
        _max: { auctionEndsAt: true },
      });
      const maxEndMs = maxRound._max.auctionEndsAt
        ? maxRound._max.auctionEndsAt.getTime()
        : 0;
      const testBaseMs = Math.max(Date.now(), maxEndMs) + 24 * 3600 * 1000; // 1 day after latest existing round
      const HOUR_MS = 3600 * 1000;

      const roundATitle = `Integration Round A ${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const roundBTitle = `Integration Round B Back-to-Back ${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const roundCTitle = `Integration Round C Future ${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const roundOverlapTitle = `Integration Round Overlap ${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

      // 1. First round in safe interval succeeds via POST /auctions/rounds
      // Includes a 1-hour gap between submissionEndsAt and auctionStartsAt to test 'waiting' phase
      const resA = await request(app)
        .post("/auctions/rounds")
        .set("Authorization", `Bearer ${marketingToken}`)
        .send({
          title: roundATitle,
          submissionStartsAt: new Date(testBaseMs).toISOString(),
          submissionEndsAt: new Date(testBaseMs + 2 * HOUR_MS).toISOString(),
          auctionStartsAt: new Date(testBaseMs + 3 * HOUR_MS).toISOString(),
          auctionEndsAt: new Date(testBaseMs + 5 * HOUR_MS).toISOString(),
        });
      assert.equal(
        resA.status,
        201,
        `Failed to create first round: ${JSON.stringify(resA.body)}`,
      );
      assert.equal(resA.body.title, roundATitle);
      createdRoundIds.push(resA.body.id);

      // 2. Overlapping round returns 409 Conflict with detailed error message
      const resOverlap = await request(app)
        .post("/auctions/rounds")
        .set("Authorization", `Bearer ${marketingToken}`)
        .send({
          title: roundOverlapTitle,
          submissionStartsAt: new Date(testBaseMs + 1 * HOUR_MS).toISOString(),
          submissionEndsAt: new Date(testBaseMs + 3 * HOUR_MS).toISOString(),
          auctionStartsAt: new Date(testBaseMs + 3 * HOUR_MS).toISOString(),
          auctionEndsAt: new Date(testBaseMs + 6 * HOUR_MS).toISOString(),
        });
      assert.equal(resOverlap.status, 409);
      assert.ok(
        resOverlap.body.error?.includes(roundATitle) ||
          resOverlap.body.message?.includes(roundATitle),
        "409 Conflict message must identify the conflicting round",
      );

      // 3. Back-to-back round succeeds:
      // new.submissionStartsAt === existing.auctionEndsAt (testBaseMs + 5 * HOUR_MS)
      const resB = await request(app)
        .post("/auctions/rounds")
        .set("Authorization", `Bearer ${marketingToken}`)
        .send({
          title: roundBTitle,
          submissionStartsAt: new Date(testBaseMs + 5 * HOUR_MS).toISOString(),
          submissionEndsAt: new Date(testBaseMs + 7 * HOUR_MS).toISOString(),
          auctionStartsAt: new Date(testBaseMs + 7 * HOUR_MS).toISOString(),
          auctionEndsAt: new Date(testBaseMs + 9 * HOUR_MS).toISOString(),
        });
      assert.equal(
        resB.status,
        201,
        `Back-to-back round must succeed: ${JSON.stringify(resB.body)}`,
      );
      assert.equal(resB.body.title, roundBTitle);
      createdRoundIds.push(resB.body.id);

      // 4. Multiple non-overlapping future rounds succeed
      const resC = await request(app)
        .post("/auctions/rounds")
        .set("Authorization", `Bearer ${marketingToken}`)
        .send({
          title: roundCTitle,
          submissionStartsAt: new Date(testBaseMs + 11 * HOUR_MS).toISOString(),
          submissionEndsAt: new Date(testBaseMs + 13 * HOUR_MS).toISOString(),
          auctionStartsAt: new Date(testBaseMs + 13 * HOUR_MS).toISOString(),
          auctionEndsAt: new Date(testBaseMs + 15 * HOUR_MS).toISOString(),
        });
      assert.equal(resC.status, 201);
      assert.equal(resC.body.title, roundCTitle);
      createdRoundIds.push(resC.body.id);

      // 5. Deterministic round selection with injected fakeNow at service level
      // During Round A submission: testBaseMs + 1h
      const currentSub = await auctionService.getCurrentRound(
        new Date(testBaseMs + 1 * HOUR_MS),
      );
      assert.equal(currentSub.round?.id, resA.body.id);
      assert.equal(currentSub.phase, "submission");
      assert.equal(currentSub.isSubmissionOpen, true);
      assert.equal(currentSub.isAuctionActive, false);

      // During Round A waiting (gap between submissionEndsAt and auctionStartsAt): testBaseMs + 2.5h
      const currentWaiting = await auctionService.getCurrentRound(
        new Date(testBaseMs + 2.5 * HOUR_MS),
      );
      assert.equal(currentWaiting.round?.id, resA.body.id);
      assert.equal(currentWaiting.phase, "waiting");
      assert.equal(currentWaiting.isSubmissionOpen, false);
      assert.equal(currentWaiting.isAuctionActive, false);

      // During Round A auction: testBaseMs + 4h
      const currentAuc = await auctionService.getCurrentRound(
        new Date(testBaseMs + 4 * HOUR_MS),
      );
      assert.equal(currentAuc.round?.id, resA.body.id);
      assert.equal(currentAuc.phase, "auction");
      assert.equal(currentAuc.isSubmissionOpen, false);
      assert.equal(currentAuc.isAuctionActive, true);

      // Before Round A (upcoming): testBaseMs - 1h -> returns nearest upcoming round (Round A)
      const currentUpcoming = await auctionService.getCurrentRound(
        new Date(testBaseMs - 1 * HOUR_MS),
      );
      assert.equal(currentUpcoming.round?.id, resA.body.id);
      assert.equal(currentUpcoming.phase, "upcoming");
      assert.equal(currentUpcoming.isSubmissionOpen, false);
      assert.equal(currentUpcoming.isAuctionActive, false);

      // After all created rounds (testBaseMs + 100 days) -> returns null
      const currentEnded = await auctionService.getCurrentRound(
        new Date(testBaseMs + 100 * 24 * HOUR_MS),
      );
      assert.equal(currentEnded.round, null);
      assert.equal(currentEnded.phase, null);

      // 6. Repository active-submission-round selection (see Step 1 for real POST /auctions attachment verification)
      const activeSub = await auctionRepository.findActiveSubmissionRound(
        new Date(testBaseMs + 1 * HOUR_MS),
      );
      assert.equal(
        activeSub?.id,
        resA.body.id,
        "Repository must select the only active submission round (Step 1 verifies live POST /auctions round attachment)",
      );

      // 7. Concurrent overlapping creates result in exactly 1 success (201) and 1 conflict (409)
      const concurrentInterval = {
        title1: `Concurrent Round 1 ${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        title2: `Concurrent Round 2 ${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        submissionStartsAt: new Date(testBaseMs + 20 * HOUR_MS).toISOString(),
        submissionEndsAt: new Date(testBaseMs + 22 * HOUR_MS).toISOString(),
        auctionStartsAt: new Date(testBaseMs + 22 * HOUR_MS).toISOString(),
        auctionEndsAt: new Date(testBaseMs + 24 * HOUR_MS).toISOString(),
      };

      const [req1, req2] = await Promise.all([
        request(app)
          .post("/auctions/rounds")
          .set("Authorization", `Bearer ${marketingToken}`)
          .send({
            title: concurrentInterval.title1,
            submissionStartsAt: concurrentInterval.submissionStartsAt,
            submissionEndsAt: concurrentInterval.submissionEndsAt,
            auctionStartsAt: concurrentInterval.auctionStartsAt,
            auctionEndsAt: concurrentInterval.auctionEndsAt,
          }),
        request(app)
          .post("/auctions/rounds")
          .set("Authorization", `Bearer ${marketingToken}`)
          .send({
            title: concurrentInterval.title2,
            submissionStartsAt: concurrentInterval.submissionStartsAt,
            submissionEndsAt: concurrentInterval.submissionEndsAt,
            auctionStartsAt: concurrentInterval.auctionStartsAt,
            auctionEndsAt: concurrentInterval.auctionEndsAt,
          }),
      ]);

      const statuses = [req1.status, req2.status].sort();
      assert.deepEqual(
        statuses,
        [201, 409],
        `Concurrent creates must result in exactly one 201 and one 409: got [${req1.status}, ${req2.status}]`,
      );

      if (req1.status === 201) createdRoundIds.push(req1.body.id);
      if (req2.status === 201) createdRoundIds.push(req2.body.id);
    },
  );
});
