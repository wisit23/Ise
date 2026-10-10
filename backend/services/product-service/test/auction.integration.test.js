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
process.env.DATABASE_URL_PRODUCT = process.env.DATABASE_URL;
const REDIS_URL = (process.env.REDIS_URL || "redis://localhost:6379")
  .replace("@redis:", "@localhost:")
  .replace("://redis:", "://localhost:");
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

const verifiedSellerToken = signAccessToken({
  sub: "seller-auction-test-01",
  role: "SELLER",
  kycVerified: true,
  displayName: "Verified Seller Tester",
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

  // Precondition: Fail loud if there is an external active round not owned by this test suite
  const externalActive = await prisma.auctionRound.findFirst({
    where: {
      submissionStartsAt: { lte: new Date() },
      submissionEndsAt: { gt: new Date() },
    },
  });
  if (externalActive) {
    throw new Error(
      `Integration test aborted: detected pre-existing active auction round (id: ${externalActive.id}, title: "${externalActive.title}"). Test suite must not mutate external rounds. Please ensure no external rounds are active during test execution.`,
    );
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

    try {
      const auditEntityIds = [...createdAuctionIds, ...createdRoundIds];
      if (auditEntityIds.length > 0) {
        await prisma.marketingAuditLog.deleteMany({
          where: { entityId: { in: auditEntityIds } },
        });
      }
    } catch (err) {
      cleanupErrors.push(err);
    }

    // Verify that NO test-created fixtures remain in DB
    try {
      const [
        remainingBids,
        remainingAuctions,
        remainingProducts,
        remainingRounds,
      ] = await Promise.all([
        createdBidIds.length
          ? prisma.bid.count({ where: { id: { in: createdBidIds } } })
          : 0,
        createdAuctionIds.length
          ? prisma.auctionItem.count({
              where: { id: { in: createdAuctionIds } },
            })
          : 0,
        createdProductIds.length
          ? prisma.product.count({ where: { id: { in: createdProductIds } } })
          : 0,
        createdRoundIds.length
          ? prisma.auctionRound.count({
              where: { id: { in: createdRoundIds } },
            })
          : 0,
      ]);
      assert.equal(remainingBids, 0, "No test bids must remain in DB");
      assert.equal(
        remainingAuctions,
        0,
        "No test auction items must remain in DB",
      );
      assert.equal(remainingProducts, 0, "No test products must remain in DB");
      assert.equal(
        remainingRounds,
        0,
        "No test auction rounds must remain in DB",
      );
    } catch (err) {
      cleanupErrors.push(err);
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
    categories = [],
  } = {}) {
    const now = Date.now();
    const round = await prisma.auctionRound.create({
      data: {
        title: `Test Round ${now}`,
        categories,
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
          roundId: round.id,
          productId: product.id,
          startingPrice: 200,
          bidIncrement: 20,
        });
      if (res.body?.id) createdAuctionIds.push(res.body.id);

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
      const round = await createTestRound();
      const product = await createTestProduct("seller-auction-test-01");

      const submitRes = await request(app)
        .post("/auctions")
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({
          roundId: round.id,
          productId: product.id,
          startingPrice: 300,
          bidIncrement: 25,
        });
      if (submitRes.body?.id) createdAuctionIds.push(submitRes.body.id);
      assert.equal(submitRes.status, 201);
      const auctionId = submitRes.body.id;

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
    const round = await createTestRound();
    const product = await createTestProduct("seller-auction-test-01");

    const submitRes = await request(app)
      .post("/auctions")
      .set("Authorization", `Bearer ${sellerToken}`)
      .send({
        roundId: round.id,
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
      const round = await createTestRound();
      const product = await createTestProduct("seller-auction-test-01");

      const submitRes = await request(app)
        .post("/auctions")
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({
          roundId: round.id,
          productId: product.id,
          startingPrice: 150,
          bidIncrement: 10,
        });
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
        .send({
          roundId: round.id,
          productId: product2.id,
          startingPrice: 150,
          bidIncrement: 10,
        });
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
      const round = await createTestRound();
      const product = await createTestProduct("seller-auction-test-01");

      const submitRes = await request(app)
        .post("/auctions")
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({
          roundId: round.id,
          productId: product.id,
          startingPrice: 100,
          bidIncrement: 20,
        });
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
      const round = await createTestRound();
      const product = await createTestProduct("seller-auction-test-01");

      const submitRes = await request(app)
        .post("/auctions")
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({
          roundId: round.id,
          productId: product.id,
          startingPrice: 100,
          bidIncrement: 10,
        });
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
      const round = await createTestRound();
      const product = await createTestProduct("seller-auction-test-01");

      const submitRes = await request(app)
        .post("/auctions")
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({
          roundId: round.id,
          productId: product.id,
          startingPrice: 200,
          bidIncrement: 20,
        });
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
      const round = await createTestRound();
      const product = await createTestProduct("seller-auction-test-01");

      const submitRes = await request(app)
        .post("/auctions")
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({
          roundId: round.id,
          productId: product.id,
          startingPrice: 200,
          bidIncrement: 20,
        });
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
        if (payload.auctionId === auctionId) {
          orderClientCalls++;
          orderClientPayload = payload;
        }
        return { id: "order-step8-mock" };
      });

      // 3. Start real BullMQ worker
      testWorker = auctionCloseQueue.startWorker(auctionService.get);

      // 4. Poll PostgreSQL with a bounded timeout (max 10s, every 100ms) until closed
      const pollStart = Date.now();
      let closedDbItem = null;
      while (Date.now() - pollStart < 10000) {
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
    "Step 9: No-bid Auction close transitions product status to 'auction_action_required' (MKT-DEC-026)",
    async () => {
      const round = await createTestRound();
      const product = await createTestProduct("seller-auction-test-01");

      const submitRes = await request(app)
        .post("/auctions")
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({
          roundId: round.id,
          productId: product.id,
          startingPrice: 300,
          bidIncrement: 30,
        });
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

      // Verify Product status transitioned to 'auction_action_required' in PostgreSQL
      const freshProduct = await prisma.product.findUnique({
        where: { id: product.id },
      });
      assert.equal(
        freshProduct.status,
        "auction_action_required",
        "No-bid auction close must transition product to auction_action_required",
      );
    },
  );

  await t.test(
    "Step 10: Concurrent Auction Rounds Creation & Deterministic Selection (MKT-DEC-025)",
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

      // 2. Overlapping round succeeds with 201 Created under MKT-DEC-025
      const resOverlap = await request(app)
        .post("/auctions/rounds")
        .set("Authorization", `Bearer ${marketingToken}`)
        .send({
          title: roundOverlapTitle,
          submissionStartsAt: new Date(testBaseMs + 1 * HOUR_MS).toISOString(),
          submissionEndsAt: new Date(testBaseMs + 2 * HOUR_MS).toISOString(),
          auctionStartsAt: new Date(testBaseMs + 3.5 * HOUR_MS).toISOString(),
          auctionEndsAt: new Date(testBaseMs + 6 * HOUR_MS).toISOString(),
        });
      assert.equal(
        resOverlap.status,
        201,
        `Overlapping round must succeed under MKT-DEC-025: ${JSON.stringify(resOverlap.body)}`,
      );
      assert.equal(resOverlap.body.title, roundOverlapTitle);
      createdRoundIds.push(resOverlap.body.id);

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
      const activeSubRounds =
        await auctionRepository.findActiveSubmissionRounds(
          new Date(testBaseMs + 1 * HOUR_MS),
        );
      assert.equal(
        activeSubRounds[0]?.id,
        resA.body.id,
        "Repository must select the only active submission round (Step 1 verifies live POST /auctions round attachment)",
      );

      // 7. Concurrent overlapping creates both succeed (201) under MKT-DEC-025
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
        [201, 201],
        `Concurrent creates must both succeed with 201 under MKT-DEC-025: got [${req1.status}, ${req2.status}]`,
      );

      if (req1.body?.id) createdRoundIds.push(req1.body.id);
      if (req2.body?.id) createdRoundIds.push(req2.body.id);
    },
  );

  async function expireTestRounds() {
    if (createdRoundIds.length === 0) return;
    await prisma.auctionRound.updateMany({
      where: {
        id: { in: createdRoundIds },
        submissionStartsAt: { lte: new Date() },
        submissionEndsAt: { gt: new Date() },
      },
      data: {
        submissionEndsAt: new Date(Date.now() - 1000),
      },
    });
  }

  await t.test(
    "Step 11: Atomic Product & AuctionItem Creation (Flow B) in PostgreSQL single transaction",
    async () => {
      await expireTestRounds();
      const round = await createTestRound({
        categories: ["รองเท้า", "เสื้อผ้า"],
      });

      const uniqueTitle = `Atomic Integration Sneaker ${Date.now()}`;
      const res = await request(app)
        .post("/auctions")
        .set("Authorization", `Bearer ${verifiedSellerToken}`)
        .send({
          roundId: round.id,
          title: uniqueTitle,
          category: "รองเท้า",
          condition: "Like New",
          size: "42",
          brand: "Nike",
          startingPrice: 600,
          bidIncrement: 50,
          media: [
            { url: "https://example.com/1.jpg", type: "IMAGE" },
            { url: "https://example.com/2.jpg", type: "IMAGE" },
            { url: "https://example.com/3.jpg", type: "IMAGE" },
            { url: "https://example.com/4.jpg", type: "IMAGE" },
          ],
        });

      if (res.body?.id) createdAuctionIds.push(res.body.id);
      if (res.body?.productId) createdProductIds.push(res.body.productId);

      assert.equal(
        res.status,
        201,
        `Expected 201 Created: ${JSON.stringify(res.body)}`,
      );
      assert.ok(res.body.id, "AuctionItem ID must exist");
      assert.ok(res.body.productId, "Product ID must exist");
      assert.equal(res.body.status, "pending_approval");
      assert.equal(res.body.startingPrice, 600);
      assert.equal(res.body.roundId, round.id);

      const productInDb = await prisma.product.findUnique({
        where: { id: res.body.productId },
      });
      assert.ok(productInDb, "Product must exist in database");
      assert.equal(productInDb.status, "auction");
      assert.equal(productInDb.title, uniqueTitle);
      assert.equal(productInDb.category, "รองเท้า");
      assert.equal(productInDb.sellerId, "seller-auction-test-01");

      const itemInDb = await prisma.auctionItem.findUnique({
        where: { id: res.body.id },
      });
      assert.ok(itemInDb, "AuctionItem must exist in database");
      assert.equal(itemInDb.productId, productInDb.id);
      assert.equal(itemInDb.roundId, round.id);
      assert.equal(itemInDb.status, "pending_approval");
    },
  );

  await t.test(
    "Step 12: Atomic Rollback & Pre-creation Validation -> Rejects before creating Product in DB",
    async () => {
      await expireTestRounds();
      const round = await createTestRound({
        categories: ["เสื้อผ้า"],
      });

      const uniqueTitle = `Rollback Test Item ${Date.now()}`;
      const res = await request(app)
        .post("/auctions")
        .set("Authorization", `Bearer ${verifiedSellerToken}`)
        .send({
          roundId: round.id,
          title: uniqueTitle,
          category: "กระเป๋า",
          condition: "Like New",
          startingPrice: 400,
          bidIncrement: 40,
          media: [
            { url: "https://example.com/1.jpg", type: "IMAGE" },
            { url: "https://example.com/2.jpg", type: "IMAGE" },
            { url: "https://example.com/3.jpg", type: "IMAGE" },
            { url: "https://example.com/4.jpg", type: "IMAGE" },
          ],
        });

      if (res.body?.id) createdAuctionIds.push(res.body.id);
      if (res.body?.productId) createdProductIds.push(res.body.productId);

      assert.equal(res.status, 400);
      assert.ok(
        res.body.error.includes("กระเป๋า") &&
          res.body.error.includes("ไม่เปิดรับสินค้าหมวดหมู่"),
        `Expected error message about category: ${res.body.error}`,
      );

      const productInDb = await prisma.product.findFirst({
        where: { title: uniqueTitle },
      });
      assert.equal(
        productInDb,
        null,
        "Product must NOT be created when validation fails",
      );

      const origCreate = auctionRepository.create;
      auctionRepository.create = async () => {
        throw new Error("Simulated database constraint failure on AuctionItem");
      };

      const rollbackTitle = `Simulated Failure Product ${Date.now()}`;
      try {
        await assert.rejects(
          auctionService.submit({
            user: {
              id: "seller-auction-test-01",
              role: "SELLER",
              kycVerified: true,
            },
            input: {
              roundId: round.id,
              title: rollbackTitle,
              category: "เสื้อผ้า",
              condition: "Good",
              startingPrice: 300,
              bidIncrement: 30,
              media: [
                { url: "https://example.com/1.jpg", type: "IMAGE" },
                { url: "https://example.com/2.jpg", type: "IMAGE" },
                { url: "https://example.com/3.jpg", type: "IMAGE" },
                { url: "https://example.com/4.jpg", type: "IMAGE" },
              ],
            },
          }),
          /Simulated database constraint failure/,
        );
      } finally {
        auctionRepository.create = origCreate;
      }

      const rolledBackProduct = await prisma.product.findFirst({
        where: { title: rollbackTitle },
      });
      assert.equal(
        rolledBackProduct,
        null,
        "Product must be rolled back in PostgreSQL when AuctionItem creation fails",
      );
    },
  );

  await t.test(
    "Step 13: Category & KYC Pre-validation -> Rejection before database writes",
    async () => {
      await expireTestRounds();
      const round = await createTestRound({ categories: [] });

      const resNonExistent = await request(app)
        .post("/auctions")
        .set("Authorization", `Bearer ${verifiedSellerToken}`)
        .send({
          roundId: round.id,
          title: "Invalid Cat Item",
          category: "หมวดหมู่นอกระบบ123",
          condition: "Good",
          startingPrice: 200,
          bidIncrement: 20,
          media: [
            { url: "https://example.com/1.jpg", type: "IMAGE" },
            { url: "https://example.com/2.jpg", type: "IMAGE" },
            { url: "https://example.com/3.jpg", type: "IMAGE" },
            { url: "https://example.com/4.jpg", type: "IMAGE" },
          ],
        });
      if (resNonExistent.body?.id)
        createdAuctionIds.push(resNonExistent.body.id);
      if (resNonExistent.body?.productId)
        createdProductIds.push(resNonExistent.body.productId);
      assert.equal(resNonExistent.status, 400);
      assert.ok(resNonExistent.body.error.includes("ไม่มีอยู่ในระบบ"));

      const unverifiedToken = signAccessToken({
        sub: "unverified-seller-01",
        role: "SELLER",
        kycVerified: false,
        displayName: "Unverified Seller",
      });
      const resUnverified = await request(app)
        .post("/auctions")
        .set("Authorization", `Bearer ${unverifiedToken}`)
        .send({
          roundId: round.id,
          title: "Unverified Seller Item",
          category: "เสื้อผ้า",
          condition: "Good",
          startingPrice: 200,
          bidIncrement: 20,
          media: [
            { url: "https://example.com/1.jpg", type: "IMAGE" },
            { url: "https://example.com/2.jpg", type: "IMAGE" },
            { url: "https://example.com/3.jpg", type: "IMAGE" },
            { url: "https://example.com/4.jpg", type: "IMAGE" },
          ],
        });
      if (resUnverified.body?.id) createdAuctionIds.push(resUnverified.body.id);
      if (resUnverified.body?.productId)
        createdProductIds.push(resUnverified.body.productId);
      assert.equal(resUnverified.status, 403);
      assert.ok(
        resUnverified.body.error.includes("identity verification") ||
          resUnverified.body.error.includes("ยืนยันตัวตน"),
      );
    },
  );

  await t.test(
    "Step 14: Flow A (Existing Product) Enforces DB Category & Ignores Client Category",
    async () => {
      await expireTestRounds();
      const round = await createTestRound({
        categories: ["รองเท้า"],
      });

      const bagProduct = await createTestProduct(
        "seller-auction-test-01",
        "Existing Bag",
        "available",
      );
      await prisma.product.update({
        where: { id: bagProduct.id },
        data: { category: "กระเป๋า" },
      });

      const deceptionRes = await request(app)
        .post("/auctions")
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({
          roundId: round.id,
          productId: bagProduct.id,
          category: "รองเท้า",
          startingPrice: 300,
          bidIncrement: 30,
        });

      if (deceptionRes.body?.id) createdAuctionIds.push(deceptionRes.body.id);
      if (deceptionRes.body?.productId)
        createdProductIds.push(deceptionRes.body.productId);

      assert.equal(deceptionRes.status, 400);
      assert.ok(
        deceptionRes.body.error.includes("กระเป๋า") &&
          deceptionRes.body.error.includes("ไม่เปิดรับสินค้าหมวดหมู่"),
        "Must reject based on actual DB product category",
      );

      const freshBag = await prisma.product.findUnique({
        where: { id: bagProduct.id },
      });
      assert.equal(freshBag.status, "available");

      const shoesProduct = await createTestProduct(
        "seller-auction-test-01",
        "Existing Shoes",
        "available",
      );
      await prisma.product.update({
        where: { id: shoesProduct.id },
        data: { category: "รองเท้า" },
      });

      const validRes = await request(app)
        .post("/auctions")
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({
          roundId: round.id,
          productId: shoesProduct.id,
          startingPrice: 300,
          bidIncrement: 30,
        });

      if (validRes.body?.id) createdAuctionIds.push(validRes.body.id);
      if (validRes.body?.productId)
        createdProductIds.push(validRes.body.productId);

      assert.equal(validRes.status, 201);

      const freshShoes = await prisma.product.findUnique({
        where: { id: shoesProduct.id },
      });
      assert.equal(freshShoes.status, "auction");
    },
  );

  await t.test(
    "Step 15: Backward Compatibility - Round with empty categories accepts any valid category",
    async () => {
      await expireTestRounds();
      const openRound = await createTestRound({ categories: [] });

      const res = await request(app)
        .post("/auctions")
        .set("Authorization", `Bearer ${verifiedSellerToken}`)
        .send({
          roundId: openRound.id,
          title: `All Category Allowed ${Date.now()}`,
          category: "vintage",
          condition: "Fair",
          startingPrice: 150,
          bidIncrement: 15,
          media: [
            { url: "https://example.com/1.jpg", type: "IMAGE" },
            { url: "https://example.com/2.jpg", type: "IMAGE" },
            { url: "https://example.com/3.jpg", type: "IMAGE" },
            { url: "https://example.com/4.jpg", type: "IMAGE" },
          ],
        });

      if (res.body?.id) createdAuctionIds.push(res.body.id);
      if (res.body?.productId) createdProductIds.push(res.body.productId);

      assert.equal(res.status, 201);
      assert.equal(res.body.roundId, openRound.id);
    },
  );

  await t.test(
    "Step 16: Transaction Rollback when round expires between pre-validation and transaction",
    async () => {
      await expireTestRounds();
      const round = await createTestRound({
        categories: ["เสื้อผ้า"],
        subStartsInMs: -3600000,
        subEndsInMs: 3600000,
      });

      const uniqueTitle = `Round Expire Tx Product ${Date.now()}`;

      // Intercept findRoundForSubmission once to expire this test round in DB right before tx check
      const origFindRound = auctionRepository.findRoundForSubmission;
      auctionRepository.findRoundForSubmission = async (id, tx) => {
        await prisma.auctionRound.update({
          where: { id: round.id },
          data: { submissionEndsAt: new Date(Date.now() - 1000) },
        });
        return origFindRound(id, tx);
      };

      try {
        const res = await request(app)
          .post("/auctions")
          .set("Authorization", `Bearer ${verifiedSellerToken}`)
          .send({
            roundId: round.id,
            title: uniqueTitle,
            category: "เสื้อผ้า",
            condition: "Like New",
            startingPrice: 500,
            bidIncrement: 50,
            media: [
              { url: "https://example.com/1.jpg", type: "IMAGE" },
              { url: "https://example.com/2.jpg", type: "IMAGE" },
              { url: "https://example.com/3.jpg", type: "IMAGE" },
              { url: "https://example.com/4.jpg", type: "IMAGE" },
            ],
          });

        if (res.body?.id) createdAuctionIds.push(res.body.id);
        if (res.body?.productId) createdProductIds.push(res.body.productId);

        assert.equal(res.status, 400);
        assert.ok(
          res.body.error.includes("ปิดรับสินค้าแล้ว") ||
            res.body.error.includes("หมดเวลา") ||
            res.body.error.includes("ไม่พร้อมรับสินค้า"),
          `Expected error about round expiration: ${res.body.error}`,
        );

        const productInDb = await prisma.product.findFirst({
          where: { title: uniqueTitle },
        });
        assert.equal(
          productInDb,
          null,
          "Product must NOT be created when round expired in transaction",
        );
      } finally {
        auctionRepository.findRoundForSubmission = origFindRound;
      }
    },
  );

  await t.test(
    "Step 17: Multi-Round Concurrent Overlap, Explicit Selection, Item Isolation & Independent Bidding (MKT-DEC-025)",
    async () => {
      await expireTestRounds();

      // 1. Rejection without roundId
      const noRoundRes = await request(app)
        .post("/auctions")
        .set("Authorization", `Bearer ${verifiedSellerToken}`)
        .send({
          title: `No Round Product ${Date.now()}`,
          category: "เสื้อผ้า",
          condition: "New",
          startingPrice: 300,
          bidIncrement: 30,
          media: [
            { url: "https://example.com/1.jpg", type: "IMAGE" },
            { url: "https://example.com/2.jpg", type: "IMAGE" },
            { url: "https://example.com/3.jpg", type: "IMAGE" },
            { url: "https://example.com/4.jpg", type: "IMAGE" },
          ],
        });
      assert.equal(noRoundRes.status, 400);
      assert.ok(
        noRoundRes.body.error.includes("กรุณาเลือกรอบประมูล"),
        `Expected error about missing roundId: ${noRoundRes.body.error}`,
      );

      // 2. Rejection with non-existent roundId
      const fakeRoundRes = await request(app)
        .post("/auctions")
        .set("Authorization", `Bearer ${verifiedSellerToken}`)
        .send({
          roundId: "00000000-0000-0000-0000-000000000000",
          title: `Fake Round Product ${Date.now()}`,
          category: "เสื้อผ้า",
          condition: "New",
          startingPrice: 300,
          bidIncrement: 30,
          media: [
            { url: "https://example.com/1.jpg", type: "IMAGE" },
            { url: "https://example.com/2.jpg", type: "IMAGE" },
            { url: "https://example.com/3.jpg", type: "IMAGE" },
            { url: "https://example.com/4.jpg", type: "IMAGE" },
          ],
        });
      assert.equal(fakeRoundRes.status, 400);
      assert.ok(
        fakeRoundRes.body.error.includes("ไม่พบรอบประมูลที่เลือก"),
        `Expected error about non-existent round: ${fakeRoundRes.body.error}`,
      );

      // 3. Create two concurrent overlapping rounds
      const roundA = await createTestRound({
        subStartsInMs: -3600000,
        subEndsInMs: 3600000,
        aucStartsInMs: 3600000,
        aucEndsInMs: 7200000,
        categories: ["เสื้อผ้า", "รองเท้า"],
      });
      const roundB = await createTestRound({
        subStartsInMs: -1800000,
        subEndsInMs: 5400000,
        aucStartsInMs: 5400000,
        aucEndsInMs: 9000000,
        categories: ["กระเป๋า", "เครื่องประดับ"],
      });

      // 4. Seller submits Product A to Round A, and Product B to Round B
      const titleA = `Product for Round A ${Date.now()}`;
      const resA = await request(app)
        .post("/auctions")
        .set("Authorization", `Bearer ${verifiedSellerToken}`)
        .send({
          roundId: roundA.id,
          title: titleA,
          category: "เสื้อผ้า",
          condition: "Like New",
          startingPrice: 500,
          bidIncrement: 50,
          media: [
            { url: "https://example.com/a1.jpg", type: "IMAGE" },
            { url: "https://example.com/a2.jpg", type: "IMAGE" },
            { url: "https://example.com/a3.jpg", type: "IMAGE" },
            { url: "https://example.com/a4.jpg", type: "IMAGE" },
          ],
        });
      assert.equal(resA.status, 201);
      assert.equal(resA.body.roundId, roundA.id);
      if (resA.body?.id) createdAuctionIds.push(resA.body.id);
      if (resA.body?.productId) createdProductIds.push(resA.body.productId);
      const auctionAId = resA.body.id;

      const titleB = `Product for Round B ${Date.now()}`;
      const resB = await request(app)
        .post("/auctions")
        .set("Authorization", `Bearer ${verifiedSellerToken}`)
        .send({
          roundId: roundB.id,
          title: titleB,
          category: "กระเป๋า",
          condition: "Good",
          startingPrice: 800,
          bidIncrement: 80,
          media: [
            { url: "https://example.com/b1.jpg", type: "IMAGE" },
            { url: "https://example.com/b2.jpg", type: "IMAGE" },
            { url: "https://example.com/b3.jpg", type: "IMAGE" },
            { url: "https://example.com/b4.jpg", type: "IMAGE" },
          ],
        });
      assert.equal(resB.status, 201);
      assert.equal(resB.body.roundId, roundB.id);
      if (resB.body?.id) createdAuctionIds.push(resB.body.id);
      if (resB.body?.productId) createdProductIds.push(resB.body.productId);
      const auctionBId = resB.body.id;

      // 5. Test GET /rounds/browse returns both Round A and Round B
      const browseRes = await request(app).get("/auctions/rounds/browse");
      assert.equal(browseRes.status, 200);
      assert.ok(Array.isArray(browseRes.body.activeAuctionRounds));
      assert.ok(Array.isArray(browseRes.body.upcomingRounds));
      const allBrowseIds = [
        ...browseRes.body.activeAuctionRounds.map((r) => r.id),
        ...browseRes.body.upcomingRounds.map((r) => r.id),
      ];
      assert.ok(
        allBrowseIds.includes(roundA.id),
        "Browse rounds must include Round A",
      );
      assert.ok(
        allBrowseIds.includes(roundB.id),
        "Browse rounds must include Round B",
      );

      // 6. Marketing approves both auctions
      const approveARes = await request(app)
        .patch(`/auctions/${auctionAId}/approve`)
        .set("Authorization", `Bearer ${marketingToken}`);
      assert.equal(approveARes.status, 200);

      const approveBRes = await request(app)
        .patch(`/auctions/${auctionBId}/approve`)
        .set("Authorization", `Bearer ${marketingToken}`);
      assert.equal(approveBRes.status, 200);

      // 7. Advance both auctions to open in DB
      await prisma.auctionItem.update({
        where: { id: auctionAId },
        data: {
          status: "open",
          scheduledStartAt: new Date(Date.now() - 10000),
          scheduledEndAt: new Date(Date.now() + 3600000),
        },
      });
      await prisma.auctionItem.update({
        where: { id: auctionBId },
        data: {
          status: "open",
          scheduledStartAt: new Date(Date.now() - 10000),
          scheduledEndAt: new Date(Date.now() + 3600000),
        },
      });

      // 8. Buyer views items per round via GET /rounds/:roundId/items (Item Isolation)
      const itemsARes = await request(app).get(
        `/auctions/rounds/${roundA.id}/items`,
      );
      assert.equal(itemsARes.status, 200);
      assert.ok(Array.isArray(itemsARes.body.items));
      const aItemIds = itemsARes.body.items.map((i) => i.id);
      assert.ok(
        aItemIds.includes(auctionAId),
        "Round A items must contain Auction A",
      );
      assert.ok(
        !aItemIds.includes(auctionBId),
        "Round A items must NOT contain Auction B (Isolation)",
      );

      const itemsBRes = await request(app).get(
        `/auctions/rounds/${roundB.id}/items`,
      );
      assert.equal(itemsBRes.status, 200);
      assert.ok(Array.isArray(itemsBRes.body.items));
      const bItemIds = itemsBRes.body.items.map((i) => i.id);
      assert.ok(
        bItemIds.includes(auctionBId),
        "Round B items must contain Auction B",
      );
      assert.ok(
        !bItemIds.includes(auctionAId),
        "Round B items must NOT contain Auction A (Isolation)",
      );

      // 9. Independent Bidding: Buyer 1 bids on Auction A, Buyer 2 bids on Auction B
      const bidARes = await request(app)
        .post(`/auctions/${auctionAId}/bids`)
        .set("Authorization", `Bearer ${buyer1Token}`)
        .send({ amount: 500, idempotencyKey: `mkt-dec-025-a-${Date.now()}` });
      assert.equal(bidARes.status, 201);
      assert.equal(bidARes.body.amount, 500);
      if (bidARes.body?.id) createdBidIds.push(bidARes.body.id);

      const bidBRes = await request(app)
        .post(`/auctions/${auctionBId}/bids`)
        .set("Authorization", `Bearer ${buyer2Token}`)
        .send({ amount: 800, idempotencyKey: `mkt-dec-025-b-${Date.now()}` });
      assert.equal(bidBRes.status, 201);
      assert.equal(bidBRes.body.amount, 800);
      if (bidBRes.body?.id) createdBidIds.push(bidBRes.body.id);

      // Verify DB bid amounts
      const freshBidA = await prisma.bid.findUnique({
        where: { id: bidARes.body.id },
      });
      const freshBidB = await prisma.bid.findUnique({
        where: { id: bidBRes.body.id },
      });
      assert.equal(freshBidA.amount, 500);
      assert.equal(freshBidB.amount, 800);
      assert.equal(freshBidA.auctionId, auctionAId);
      assert.equal(freshBidB.auctionId, auctionBId);
    },
  );

  await t.test(
    "Step 18: Single-Item Cancellation vs Other Items in Same Round & Audit Log (MKT-DEC-026)",
    async (t) => {
      await expireTestRounds();
      const chatClient = require("../src/features/auctions/chatClient");
      let itemCancelNotified = null;
      t.mock.method(chatClient, "notifyItemCancelled", async (payload) => {
        itemCancelNotified = payload;
        return { deliveredCount: 2, failedCount: 0, warnings: [] };
      });

      const round = await createTestRound({
        subStartsInMs: -3600000,
        subEndsInMs: 3600000,
        aucStartsInMs: 3600000,
        aucEndsInMs: 7200000,
      });

      const prod1 = await createTestProduct(
        "seller-auction-test-01",
        "Item 1 Cancel Target",
      );
      const prod2 = await createTestProduct(
        "seller-auction-test-01",
        "Item 2 Remains Active",
      );

      const sub1 = await request(app)
        .post("/auctions")
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({
          roundId: round.id,
          productId: prod1.id,
          startingPrice: 300,
          bidIncrement: 30,
        });
      assert.equal(sub1.status, 201);
      createdAuctionIds.push(sub1.body.id);

      const sub2 = await request(app)
        .post("/auctions")
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({
          roundId: round.id,
          productId: prod2.id,
          startingPrice: 400,
          bidIncrement: 40,
        });
      assert.equal(sub2.status, 201);
      createdAuctionIds.push(sub2.body.id);

      // 1. Reject attempt to cancel pending_approval item (must use reject instead)
      const cancelPendingRes = await request(app)
        .patch(`/auctions/${sub1.body.id}/cancel`)
        .set("Authorization", `Bearer ${marketingToken}`)
        .send({ reason: "ยังไม่อนุมัติ" });
      assert.equal(cancelPendingRes.status, 400);
      assert.ok(cancelPendingRes.body.error.includes("ปฏิเสธสินค้า"));

      // 2. Approve both items and open them
      await request(app)
        .patch(`/auctions/${sub1.body.id}/approve`)
        .set("Authorization", `Bearer ${marketingToken}`);
      await request(app)
        .patch(`/auctions/${sub2.body.id}/approve`)
        .set("Authorization", `Bearer ${marketingToken}`);

      await prisma.auctionItem.updateMany({
        where: { id: { in: [sub1.body.id, sub2.body.id] } },
        data: {
          status: "open",
          scheduledStartAt: new Date(Date.now() - 60000),
          scheduledEndAt: new Date(Date.now() + 3600000),
        },
      });

      // Place a bid on Item 1
      const bid1Res = await request(app)
        .post(`/auctions/${sub1.body.id}/bids`)
        .set("Authorization", `Bearer ${buyer1Token}`)
        .send({ amount: 300, idempotencyKey: `step18-bid1-${Date.now()}` });
      assert.equal(bid1Res.status, 201);
      createdBidIds.push(bid1Res.body.id);

      // 3. Cancel ONLY Item 1 via PATCH /auctions/:id/cancel
      const cancelRes = await request(app)
        .patch(`/auctions/${sub1.body.id}/cancel`)
        .set("Authorization", `Bearer ${marketingToken}`)
        .send({ cancellationReason: "ตรวจพบตำหนิเพิ่มเติมหลังเปิดประมูล" });

      assert.equal(cancelRes.status, 200);
      assert.equal(cancelRes.body.status, "cancelled");
      assert.equal(
        cancelRes.body.cancellationReason,
        "ตรวจพบตำหนิเพิ่มเติมหลังเปิดประมูล",
      );
      assert.equal(cancelRes.body.cancelledBy, "marketing-auction-lead-01");

      // Verify Item 1 Product is auction_action_required (NOT available) and bids preserved
      const dbProd1 = await prisma.product.findUnique({
        where: { id: prod1.id },
      });
      assert.equal(dbProd1.status, "auction_action_required");
      const dbBids1 = await prisma.bid.findMany({
        where: { auctionId: sub1.body.id },
      });
      assert.equal(dbBids1.length, 1);

      // Verify Audit Log AUCTION_ITEM_CANCEL recorded in PostgreSQL
      const auditLog = await prisma.marketingAuditLog.findFirst({
        where: { action: "AUCTION_ITEM_CANCEL", entityId: sub1.body.id },
      });
      assert.ok(auditLog, "AUCTION_ITEM_CANCEL audit log must exist in DB");
      assert.equal(auditLog.actorId, "marketing-auction-lead-01");

      // Verify chat notification called for seller + bidder on Item 1
      assert.ok(itemCancelNotified);
      assert.equal(itemCancelNotified.wasOpen, true);
      assert.deepEqual(itemCancelNotified.bidderIds, ["buyer-auction-test-01"]);

      // 4. Verify Item 2 in the SAME round is unaffected and continues accepting bids!
      const dbItem2 = await prisma.auctionItem.findUnique({
        where: { id: sub2.body.id },
      });
      assert.equal(dbItem2.status, "open");
      const bid2Res = await request(app)
        .post(`/auctions/${sub2.body.id}/bids`)
        .set("Authorization", `Bearer ${buyer2Token}`)
        .send({ amount: 400, idempotencyKey: `step18-bid2-${Date.now()}` });
      assert.equal(bid2Res.status, 201);
      createdBidIds.push(bid2Res.body.id);

      // Verify GET /auctions/rounds/:roundId/items returns both open Item 2 and cancelled Item 1
      const roundItemsRes = await request(app).get(
        `/auctions/rounds/${round.id}/items`,
      );
      assert.equal(roundItemsRes.status, 200);
      const returnedStatuses = Object.fromEntries(
        roundItemsRes.body.items.map((i) => [i.id, i.status]),
      );
      assert.equal(returnedStatuses[sub1.body.id], "cancelled");
      assert.equal(returnedStatuses[sub2.body.id], "open");
    },
  );

  await t.test(
    "Step 19: Race Conditions across Cancel Item, Cancel Round, PlaceBid, and CloseAuction (MKT-DEC-026)",
    async (t) => {
      await expireTestRounds();
      const chatClient = require("../src/features/auctions/chatClient");
      t.mock.method(chatClient, "notifyItemCancelled", async () => ({
        deliveredCount: 1,
        failedCount: 0,
        warnings: [],
      }));
      t.mock.method(chatClient, "notifyRoundCancelled", async () => ({
        deliveredCount: 1,
        failedCount: 0,
        warnings: [],
      }));

      let orderCallsForCancelled = 0;
      t.mock.method(orderClient, "createOrderFromAuction", async (payload) => {
        // Verify inside mock that DB item is NEVER already cancelled when orderClient is called
        const currentItem = await prisma.auctionItem.findUnique({
          where: { id: payload.auctionId },
          include: { round: true },
        });
        if (
          currentItem?.status === "cancelled" ||
          currentItem?.round?.cancelledAt
        ) {
          orderCallsForCancelled++;
        }
        return { id: `order-race-${payload.auctionId}` };
      });

      const mktUser = { id: "marketing-auction-lead-01", role: "MARKETING" };
      const buyerUser = { id: "buyer-auction-test-01", role: "BUYER" };

      // --- Race 1: cancel item vs placeBid ---
      const round1 = await createTestRound({
        subStartsInMs: -7200000,
        subEndsInMs: -3600000,
        aucStartsInMs: -1800000,
        aucEndsInMs: 3600000,
      });
      const prod1 = await createTestProduct(
        "seller-auction-test-01",
        "Race1 CancelItem vs Bid",
        "auction",
      );
      const item1 = await prisma.auctionItem.create({
        data: {
          productId: prod1.id,
          sellerId: "seller-auction-test-01",
          roundId: round1.id,
          startingPrice: 200,
          bidIncrement: 20,
          status: "open",
          scheduledStartAt: new Date(Date.now() - 1800000),
          scheduledEndAt: new Date(Date.now() + 3600000),
        },
      });
      createdAuctionIds.push(item1.id);

      const [r1Cancel, r1Bid] = await Promise.allSettled([
        auctionService.cancel({
          user: mktUser,
          auctionId: item1.id,
          reason: "Race 1 Cancel Item",
        }),
        auctionService.placeBid({
          user: buyerUser,
          auctionId: item1.id,
          amount: 200,
          idempotencyKey: `race1-bid-${Date.now()}`,
        }),
      ]);
      if (r1Bid.status === "fulfilled" && r1Bid.value?.id) {
        createdBidIds.push(r1Bid.value.id);
      }
      assert.equal(
        r1Cancel.status,
        "fulfilled",
        "cancel item must succeed in Race 1",
      );
      // Any subsequent bid after cancel MUST fail with 409
      await assert.rejects(
        auctionService.placeBid({
          user: buyerUser,
          auctionId: item1.id,
          amount: 240,
          idempotencyKey: `race1-post-cancel-bid-${Date.now()}`,
        }),
        (err) => err.status === 409,
      );
      const dbItem1 = await prisma.auctionItem.findUnique({
        where: { id: item1.id },
      });
      assert.equal(dbItem1.status, "cancelled");

      // --- Race 2: cancel item vs closeAuction ---
      const prod2 = await createTestProduct(
        "seller-auction-test-01",
        "Race2 CancelItem vs Close",
        "auction",
      );
      const item2 = await prisma.auctionItem.create({
        data: {
          productId: prod2.id,
          sellerId: "seller-auction-test-01",
          roundId: round1.id,
          startingPrice: 200,
          bidIncrement: 20,
          status: "open",
          scheduledStartAt: new Date(Date.now() - 1800000),
          scheduledEndAt: new Date(Date.now() - 1000),
        },
      });
      createdAuctionIds.push(item2.id);
      const bid2 = await prisma.bid.create({
        data: {
          auctionId: item2.id,
          bidderId: "buyer-auction-test-01",
          amount: 220,
          idempotencyKey: `race2-seed-bid-${Date.now()}`,
        },
      });
      createdBidIds.push(bid2.id);

      const [r2Cancel] = await Promise.allSettled([
        auctionService.cancel({
          user: mktUser,
          auctionId: item2.id,
          reason: "Race 2 Cancel Item vs Close",
        }),
        auctionService.closeAuction(item2.id),
      ]);

      const dbItem2 = await prisma.auctionItem.findUnique({
        where: { id: item2.id },
      });
      // Mutual exclusion: either cancelled with NO winningOrderId, OR closed with winningOrderId and cancel rejected
      if (dbItem2.status === "cancelled") {
        assert.equal(
          dbItem2.winningOrderId,
          null,
          "Cancelled item must NEVER have winningOrderId",
        );
        assert.equal(r2Cancel.status, "fulfilled");
      } else {
        assert.equal(dbItem2.status, "closed");
        assert.ok(dbItem2.winningOrderId);
        assert.equal(r2Cancel.status, "rejected");
      }
      assert.equal(
        orderCallsForCancelled,
        0,
        "orderClient must NEVER be called for a cancelled item",
      );

      // --- Race 3: cancel round vs placeBid ---
      const round3 = await createTestRound({
        subStartsInMs: -7200000,
        subEndsInMs: -3600000,
        aucStartsInMs: -1800000,
        aucEndsInMs: 3600000,
      });
      const prod3 = await createTestProduct(
        "seller-auction-test-01",
        "Race3 CancelRound vs Bid",
        "auction",
      );
      const item3 = await prisma.auctionItem.create({
        data: {
          productId: prod3.id,
          sellerId: "seller-auction-test-01",
          roundId: round3.id,
          startingPrice: 300,
          bidIncrement: 30,
          status: "open",
          scheduledStartAt: new Date(Date.now() - 1800000),
          scheduledEndAt: new Date(Date.now() + 3600000),
        },
      });
      createdAuctionIds.push(item3.id);

      const [r3CancelRound, r3Bid] = await Promise.allSettled([
        auctionService.cancelRound({
          user: mktUser,
          roundId: round3.id,
          reason: "Race 3 Cancel Round vs Bid",
        }),
        auctionService.placeBid({
          user: buyerUser,
          auctionId: item3.id,
          amount: 300,
          idempotencyKey: `race3-bid-${Date.now()}`,
        }),
      ]);
      if (r3Bid.status === "fulfilled" && r3Bid.value?.id) {
        createdBidIds.push(r3Bid.value.id);
      }
      assert.equal(
        r3CancelRound.status,
        "fulfilled",
        "cancelRound must succeed in Race 3",
      );
      await assert.rejects(
        auctionService.placeBid({
          user: buyerUser,
          auctionId: item3.id,
          amount: 360,
          idempotencyKey: `race3-post-cancel-${Date.now()}`,
        }),
        (err) => err.status === 409,
      );

      // --- Race 4: cancel round vs closeAuction ---
      const round4 = await createTestRound({
        subStartsInMs: -7200000,
        subEndsInMs: -3600000,
        aucStartsInMs: -1800000,
        aucEndsInMs: 3600000,
      });
      const prod4 = await createTestProduct(
        "seller-auction-test-01",
        "Race4 CancelRound vs Close",
        "auction",
      );
      const item4 = await prisma.auctionItem.create({
        data: {
          productId: prod4.id,
          sellerId: "seller-auction-test-01",
          roundId: round4.id,
          startingPrice: 400,
          bidIncrement: 40,
          status: "open",
          scheduledStartAt: new Date(Date.now() - 1800000),
          scheduledEndAt: new Date(Date.now() - 1000),
        },
      });
      createdAuctionIds.push(item4.id);
      const bid4 = await prisma.bid.create({
        data: {
          auctionId: item4.id,
          bidderId: "buyer-auction-test-01",
          amount: 440,
          idempotencyKey: `race4-seed-bid-${Date.now()}`,
        },
      });
      createdBidIds.push(bid4.id);

      const [r4CancelRound] = await Promise.allSettled([
        auctionService.cancelRound({
          user: mktUser,
          roundId: round4.id,
          reason: "Race 4 Cancel Round vs Close",
        }),
        auctionService.closeAuction(item4.id),
      ]);

      const dbItem4 = await prisma.auctionItem.findUnique({
        where: { id: item4.id },
      });
      const dbRound4 = await prisma.auctionRound.findUnique({
        where: { id: round4.id },
      });
      if (dbRound4.cancelledAt) {
        assert.equal(dbItem4.status, "cancelled");
        assert.equal(
          dbItem4.winningOrderId,
          null,
          "Cancelled round item must NEVER have winningOrderId",
        );
        assert.equal(r4CancelRound.status, "fulfilled");
      } else {
        assert.equal(dbItem4.status, "closed");
        assert.ok(dbItem4.winningOrderId);
        assert.equal(r4CancelRound.status, "rejected");
      }
      assert.equal(
        orderCallsForCancelled,
        0,
        "orderClient must NEVER be called after round cancellation",
      );
    },
  );

  await t.test(
    "Step 20: Seller Recovery Concurrency Protection - Concurrent Resubmit & Resubmit vs Relist (MKT-DEC-026)",
    async (t) => {
      await expireTestRounds();
      const chatClient = require("../src/features/auctions/chatClient");
      t.mock.method(chatClient, "notifyItemCancelled", async () => ({
        deliveredCount: 1,
        failedCount: 0,
        warnings: [],
      }));

      // Create historical round + cancelled item with bid so product is in auction_action_required
      const oldRound = await createTestRound({
        subStartsInMs: -14400000,
        subEndsInMs: -10800000,
        aucStartsInMs: -7200000,
        aucEndsInMs: 3600000,
      });
      const recoveryProd = await createTestProduct(
        "seller-auction-test-01",
        "Seller Recovery Product",
        "auction_action_required",
      );
      const historicalItem = await prisma.auctionItem.create({
        data: {
          productId: recoveryProd.id,
          sellerId: "seller-auction-test-01",
          roundId: oldRound.id,
          startingPrice: 500,
          bidIncrement: 50,
          status: "cancelled",
          cancellationReason: "ยกเลิกรอบเก่า",
          cancelledAt: new Date(),
          cancelledBy: "marketing-auction-lead-01",
        },
      });
      createdAuctionIds.push(historicalItem.id);
      const historicalBid = await prisma.bid.create({
        data: {
          auctionId: historicalItem.id,
          bidderId: "buyer-auction-test-01",
          amount: 550,
          idempotencyKey: `hist-bid-${Date.now()}`,
        },
      });
      createdBidIds.push(historicalBid.id);

      // Create new active submission round
      const newRound = await createTestRound({
        subStartsInMs: -3600000,
        subEndsInMs: 3600000,
        aucStartsInMs: 3600000,
        aucEndsInMs: 7200000,
      });

      // 1. Concurrent resubmit (2x POST /auctions on same productId)
      const [subA, subB] = await Promise.all([
        request(app)
          .post("/auctions")
          .set("Authorization", `Bearer ${sellerToken}`)
          .send({
            roundId: newRound.id,
            productId: recoveryProd.id,
            startingPrice: 600,
            bidIncrement: 60,
          }),
        request(app)
          .post("/auctions")
          .set("Authorization", `Bearer ${sellerToken}`)
          .send({
            roundId: newRound.id,
            productId: recoveryProd.id,
            startingPrice: 650,
            bidIncrement: 65,
          }),
      ]);

      if (subA.body?.id) createdAuctionIds.push(subA.body.id);
      if (subB.body?.id) createdAuctionIds.push(subB.body.id);

      const successSubs = [subA, subB].filter((r) => r.status === 201);
      const rejectedSubs = [subA, subB].filter((r) =>
        [400, 409].includes(r.status),
      );
      assert.equal(
        successSubs.length,
        1,
        `Concurrent resubmit must allow exactly 1 (got [${subA.status}, ${subB.status}])`,
      );
      assert.equal(
        rejectedSubs.length,
        1,
        `Concurrent resubmit must reject 1 with 400/409 (got [${subA.status}, ${subB.status}])`,
      );

      const winnerSub = successSubs[0].body;
      assert.notEqual(
        winnerSub.id,
        historicalItem.id,
        "Resubmitted AuctionItem must receive a new ID",
      );

      // Verify max 1 active AuctionItem and preserved history
      const allItemsForProd = await prisma.auctionItem.findMany({
        where: { productId: recoveryProd.id },
      });
      assert.equal(
        allItemsForProd.length,
        2,
        "Both historical and new AuctionItem must exist",
      );
      const activeItems = allItemsForProd.filter((i) =>
        ["draft", "pending_approval", "approved", "scheduled", "open"].includes(
          i.status,
        ),
      );
      assert.equal(
        activeItems.length,
        1,
        "At most 1 active AuctionItem may exist for a Product",
      );

      // Verify historical bid is still intact
      const preservedBid = await prisma.bid.findUnique({
        where: { id: historicalBid.id },
      });
      assert.ok(preservedBid, "Historical bid must remain intact");

      // 2. Approve & cancel the second item so Product returns to auction_action_required,
      // then race Resubmit (Flow A) vs Relist Available (Flow B)
      await request(app)
        .patch(`/auctions/${winnerSub.id}/approve`)
        .set("Authorization", `Bearer ${marketingToken}`);
      await request(app)
        .patch(`/auctions/${winnerSub.id}/cancel`)
        .set("Authorization", `Bearer ${marketingToken}`)
        .send({ reason: "ยกเลิกเพื่อทดสอบ Race Resubmit vs Relist" });

      const [raceSub, raceRelist] = await Promise.all([
        request(app)
          .post("/auctions")
          .set("Authorization", `Bearer ${sellerToken}`)
          .send({
            roundId: newRound.id,
            productId: recoveryProd.id,
            startingPrice: 700,
            bidIncrement: 70,
          }),
        request(app)
          .post(`/products/${recoveryProd.id}/relist-available`)
          .set("Authorization", `Bearer ${sellerToken}`)
          .send({ price: 990 }),
      ]);

      if (raceSub.body?.id) createdAuctionIds.push(raceSub.body.id);

      const raceSuccessCount =
        (raceSub.status === 201 ? 1 : 0) + (raceRelist.status === 200 ? 1 : 0);
      assert.equal(
        raceSuccessCount,
        1,
        `Exactly one of resubmit (${raceSub.status}) or relist (${raceRelist.status}) must succeed`,
      );

      const finalProd = await prisma.product.findUnique({
        where: { id: recoveryProd.id },
      });
      const finalActiveAuction =
        await auctionRepository.findActiveAuctionByProductId(recoveryProd.id);

      if (finalActiveAuction) {
        assert.equal(
          finalProd.status,
          "auction",
          "Product with active AuctionItem must NEVER be in 'available' status",
        );
      } else {
        assert.equal(finalProd.status, "available");
        assert.equal(finalProd.price, 990);
      }
    },
  );

  await t.test(
    "Step 21: Submit vs CancelRound Serialization under Round Mutation Lock (MKT-DEC-026)",
    async (t) => {
      await expireTestRounds();
      const chatClient = require("../src/features/auctions/chatClient");
      t.mock.method(chatClient, "notifyRoundCancelled", async () => ({
        deliveredCount: 1,
        failedCount: 0,
        warnings: [],
      }));

      // -----------------------------------------------------------------------
      // Case 1A: Existing Product submit vs cancelRound (cancelRound gets lock first)
      // -----------------------------------------------------------------------
      const round1A = await createTestRound({
        subStartsInMs: -3600000,
        subEndsInMs: 3600000,
        aucStartsInMs: 3600000,
        aucEndsInMs: 7200000,
      });
      const existingProd1A = await createTestProduct(
        "seller-auction-test-01",
        `Race1A Existing Prod ${Date.now()}`,
        "available",
      );

      const origWithRoundMutationLock = auctionRepository.withRoundMutationLock;
      let cancel1APromise = null;
      auctionRepository.withRoundMutationLock = async (roundId, fn, opts) => {
        if (roundId === round1A.id && !cancel1APromise) {
          // submit already passed pre-lock validation; now cancelRound acquires Round Lock first
          cancel1APromise = request(app)
            .patch(`/auctions/rounds/${round1A.id}/cancel`)
            .set("Authorization", `Bearer ${marketingToken}`)
            .send({ reason: "ยกเลิกรอบก่อน submit ได้ Lock (Flow A)" });
          const cancelRes = await cancel1APromise;
          assert.equal(cancelRes.status, 200);
        }
        return origWithRoundMutationLock(roundId, fn, opts);
      };

      try {
        const sub1ARes = await request(app)
          .post("/auctions")
          .set("Authorization", `Bearer ${sellerToken}`)
          .send({
            roundId: round1A.id,
            productId: existingProd1A.id,
            startingPrice: 400,
            bidIncrement: 40,
          });
        if (sub1ARes.body?.id) createdAuctionIds.push(sub1ARes.body.id);

        assert.equal(sub1ARes.status, 400);
        assert.ok(sub1ARes.body.error.includes("ถูกยกเลิกแล้ว"));

        const itemsInRound1A = await prisma.auctionItem.findMany({
          where: { roundId: round1A.id },
        });
        assert.equal(
          itemsInRound1A.length,
          0,
          "No AuctionItem may be created when cancelRound acquired Round Lock first",
        );
        const prod1AAfter = await prisma.product.findUnique({
          where: { id: existingProd1A.id },
        });
        assert.equal(prod1AAfter.status, "available");
      } finally {
        auctionRepository.withRoundMutationLock = origWithRoundMutationLock;
      }

      // -----------------------------------------------------------------------
      // Case 1B: Existing Product submit vs cancelRound (submit gets lock first)
      // -----------------------------------------------------------------------
      const round1B = await createTestRound({
        subStartsInMs: -3600000,
        subEndsInMs: 3600000,
        aucStartsInMs: 3600000,
        aucEndsInMs: 7200000,
      });
      const existingProd1B = await createTestProduct(
        "seller-auction-test-01",
        `Race1B Existing Prod ${Date.now()}`,
        "available",
      );

      let cancel1BPromise = null;
      auctionRepository.withRoundMutationLock = async (roundId, fn, opts) => {
        return origWithRoundMutationLock(
          roundId,
          async (tx) => {
            if (roundId === round1B.id && !cancel1BPromise) {
              // Inside submit's Round Lock transaction, launch cancelRound concurrently so it blocks on pg_advisory_xact_lock
              cancel1BPromise = request(app)
                .patch(`/auctions/rounds/${round1B.id}/cancel`)
                .set("Authorization", `Bearer ${marketingToken}`)
                .send({ reason: "ยกเลิกรอบหลัง submit ได้ Lock ก่อน (Flow A)" })
                .then((res) => res);
              await new Promise((r) => setTimeout(r, 80));
            }
            return fn(tx);
          },
          opts,
        );
      };

      try {
        const sub1BRes = await request(app)
          .post("/auctions")
          .set("Authorization", `Bearer ${sellerToken}`)
          .send({
            roundId: round1B.id,
            productId: existingProd1B.id,
            startingPrice: 450,
            bidIncrement: 45,
          });
        if (sub1BRes.body?.id) createdAuctionIds.push(sub1BRes.body.id);
        assert.equal(sub1BRes.status, 201);

        const cancel1BRes = await cancel1BPromise;
        assert.equal(cancel1BRes.status, 200);

        const activeInRound1B = await prisma.auctionItem.findMany({
          where: {
            roundId: round1B.id,
            status: {
              in: [
                "draft",
                "pending_approval",
                "approved",
                "scheduled",
                "open",
              ],
            },
          },
        });
        assert.equal(
          activeInRound1B.length,
          0,
          "Zero active AuctionItems may remain in cancelled round 1B",
        );

        const cancelledItem1B = await prisma.auctionItem.findUnique({
          where: { id: sub1BRes.body.id },
        });
        assert.equal(cancelledItem1B.status, "cancelled");

        const prod1BAfter = await prisma.product.findUnique({
          where: { id: existingProd1B.id },
        });
        assert.equal(prod1BAfter.status, "auction_action_required");
      } finally {
        auctionRepository.withRoundMutationLock = origWithRoundMutationLock;
      }

      // -----------------------------------------------------------------------
      // Case 2A: New Product + AuctionItem submit vs cancelRound (cancelRound gets lock first)
      // -----------------------------------------------------------------------
      const round2A = await createTestRound({
        subStartsInMs: -3600000,
        subEndsInMs: 3600000,
        aucStartsInMs: 3600000,
        aucEndsInMs: 7200000,
      });
      const orphanTitle2A = `Race2A New Product Should Not Exist ${Date.now()}`;
      let cancel2APromise = null;

      auctionRepository.withRoundMutationLock = async (roundId, fn, opts) => {
        if (roundId === round2A.id && !cancel2APromise) {
          cancel2APromise = request(app)
            .patch(`/auctions/rounds/${round2A.id}/cancel`)
            .set("Authorization", `Bearer ${marketingToken}`)
            .send({ reason: "ยกเลิกรอบก่อน submit ได้ Lock (Flow B)" });
          const cancelRes = await cancel2APromise;
          assert.equal(cancelRes.status, 200);
        }
        return origWithRoundMutationLock(roundId, fn, opts);
      };

      try {
        const sub2ARes = await request(app)
          .post("/auctions")
          .set("Authorization", `Bearer ${verifiedSellerToken}`)
          .send({
            roundId: round2A.id,
            title: orphanTitle2A,
            category: "เสื้อผ้า",
            condition: "Like New",
            startingPrice: 500,
            bidIncrement: 50,
            media: [
              { url: "https://example.com/1.jpg", type: "IMAGE" },
              { url: "https://example.com/2.jpg", type: "IMAGE" },
              { url: "https://example.com/3.jpg", type: "IMAGE" },
              { url: "https://example.com/4.jpg", type: "IMAGE" },
            ],
          });
        if (sub2ARes.body?.id) createdAuctionIds.push(sub2ARes.body.id);
        if (sub2ARes.body?.productId)
          createdProductIds.push(sub2ARes.body.productId);

        assert.equal(sub2ARes.status, 400);
        assert.ok(sub2ARes.body.error.includes("ถูกยกเลิกแล้ว"));

        const orphanProd = await prisma.product.findFirst({
          where: { title: orphanTitle2A },
        });
        assert.equal(
          orphanProd,
          null,
          "No orphan Product may remain in DB when New Product submission is rejected by cancelled round",
        );

        const itemsInRound2A = await prisma.auctionItem.findMany({
          where: { roundId: round2A.id },
        });
        assert.equal(itemsInRound2A.length, 0);
      } finally {
        auctionRepository.withRoundMutationLock = origWithRoundMutationLock;
      }

      // -----------------------------------------------------------------------
      // Case 2B: New Product + AuctionItem submit vs cancelRound (submit gets lock first)
      // -----------------------------------------------------------------------
      const round2B = await createTestRound({
        subStartsInMs: -3600000,
        subEndsInMs: 3600000,
        aucStartsInMs: 3600000,
        aucEndsInMs: 7200000,
      });
      const newTitle2B = `Race2B New Product Created Before Cancel ${Date.now()}`;
      let cancel2BPromise = null;

      auctionRepository.withRoundMutationLock = async (roundId, fn, opts) => {
        return origWithRoundMutationLock(
          roundId,
          async (tx) => {
            if (roundId === round2B.id && !cancel2BPromise) {
              cancel2BPromise = request(app)
                .patch(`/auctions/rounds/${round2B.id}/cancel`)
                .set("Authorization", `Bearer ${marketingToken}`)
                .send({ reason: "ยกเลิกรอบหลัง submit ได้ Lock ก่อน (Flow B)" })
                .then((res) => res);
              await new Promise((r) => setTimeout(r, 80));
            }
            return fn(tx);
          },
          opts,
        );
      };

      try {
        const sub2BRes = await request(app)
          .post("/auctions")
          .set("Authorization", `Bearer ${verifiedSellerToken}`)
          .send({
            roundId: round2B.id,
            title: newTitle2B,
            category: "เสื้อผ้า",
            condition: "Like New",
            startingPrice: 550,
            bidIncrement: 55,
            media: [
              { url: "https://example.com/1.jpg", type: "IMAGE" },
              { url: "https://example.com/2.jpg", type: "IMAGE" },
              { url: "https://example.com/3.jpg", type: "IMAGE" },
              { url: "https://example.com/4.jpg", type: "IMAGE" },
            ],
          });
        if (sub2BRes.body?.id) createdAuctionIds.push(sub2BRes.body.id);
        if (sub2BRes.body?.productId)
          createdProductIds.push(sub2BRes.body.productId);
        assert.equal(sub2BRes.status, 201);

        const cancel2BRes = await cancel2BPromise;
        assert.equal(cancel2BRes.status, 200);

        const activeInRound2B = await prisma.auctionItem.findMany({
          where: {
            roundId: round2B.id,
            status: {
              in: [
                "draft",
                "pending_approval",
                "approved",
                "scheduled",
                "open",
              ],
            },
          },
        });
        assert.equal(
          activeInRound2B.length,
          0,
          "Zero active AuctionItems may remain in cancelled round 2B",
        );

        const cancelledItem2B = await prisma.auctionItem.findUnique({
          where: { id: sub2BRes.body.id },
        });
        assert.equal(cancelledItem2B.status, "cancelled");

        const prod2BAfter = await prisma.product.findUnique({
          where: { id: sub2BRes.body.productId },
        });
        assert.equal(prod2BAfter.status, "auction_action_required");
      } finally {
        auctionRepository.withRoundMutationLock = origWithRoundMutationLock;
      }
    },
  );
});
