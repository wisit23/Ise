const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const repository = require("./auctionRepository");
const orderClient = require("./orderClient");
const auctionCloseQueue = require("../../jobs/auctionCloseQueue");
const service = require("./auctionService");
const productModel = require("../../models/productModel");

// Unit tests never talk to real Redis — every test that exercises schedule()
// stubs the queue calls it makes.
beforeEach((t) => {
  t.mock.method(auctionCloseQueue, "scheduleClose", async () => {});
  t.mock.method(auctionCloseQueue, "cancelClose", async () => {});
  t.mock.method(repository, "setProductStatus", async () => {});
  const defaultRound = {
    id: "round-1",
    title: "Round 1",
    categories: [],
    submissionStartsAt: new Date(Date.now() - 3600000),
    submissionEndsAt: new Date(Date.now() + 3600000),
    auctionStartsAt: new Date(Date.now() + 7200000),
    auctionEndsAt: new Date(Date.now() + 14400000),
    _count: { auctions: 0 },
  };
  t.mock.method(repository, "findActiveSubmissionRounds", async () => [
    defaultRound,
  ]);
  t.mock.method(repository, "findActiveAuctionRounds", async () => []);
  t.mock.method(repository, "findUpcomingRounds", async () => []);
  const mockAuditTx = {
    marketingAuditLog: {
      create: async () => ({ id: "audit-1" }),
      createMany: async () => ({ count: 1 }),
      findUnique: async () => ({ id: "audit-1" }),
    },
    auctionItem: {
      findUnique: async () => ({ id: "a1", status: "open" }),
      update: async () => ({ id: "a1", status: "closed" }),
    },
  };
  t.mock.method(repository, "transaction", async (fn) => fn(mockAuditTx));
  t.mock.method(repository, "withAuctionLock", async (_id, fn) =>
    repository.transaction(fn),
  );
  t.mock.method(repository, "withProductLock", async (_id, fn) =>
    repository.transaction(fn),
  );
  t.mock.method(repository, "withRoundMutationLock", async (_roundId, fn) =>
    repository.transaction(fn),
  );
  t.mock.method(repository, "findRoundForSubmission", async (id) => ({
    ...defaultRound,
    id: id || "round-1",
  }));
});

test("canTransition allows only the documented lifecycle edges", () => {
  assert.equal(service.canTransition("draft", "pending_approval"), true);
  assert.equal(service.canTransition("pending_approval", "approved"), true);
  assert.equal(service.canTransition("approved", "scheduled"), true);
  assert.equal(service.canTransition("scheduled", "open"), true);
  assert.equal(service.canTransition("open", "closed"), true);
  assert.equal(service.canTransition("published", "draft"), false);
  assert.equal(service.canTransition("closed", "open"), false);
});

test("submit rejects a buyer before querying the database", async () => {
  await assert.rejects(
    service.submit({
      user: { id: "buyer-1", role: "BUYER" },
      input: { productId: "p1", startingPrice: 100, bidIncrement: 10 },
    }),
    (err) => err.status === 403,
  );
});

test("submit rejects a non-positive starting price", async () => {
  await assert.rejects(
    service.submit({
      user: { id: "seller-1", role: "SELLER" },
      input: {
        roundId: "round-1",
        productId: "p1",
        startingPrice: 0,
        bidIncrement: 10,
      },
    }),
    (err) => err.status === 400,
  );
});

test("submit rejects a product owned by another seller", async (t) => {
  t.mock.method(repository, "findProductOwner", async () => ({
    id: "p1",
    sellerId: "seller-2",
    status: "available",
  }));

  await assert.rejects(
    service.submit({
      user: { id: "seller-1", role: "SELLER" },
      input: {
        roundId: "round-1",
        productId: "p1",
        startingPrice: 100,
        bidIncrement: 10,
      },
    }),
    (err) => err.status === 403,
  );
});

test("submit rejects a product that is not available", async (t) => {
  t.mock.method(repository, "findProductOwner", async () => ({
    id: "p1",
    sellerId: "seller-1",
    status: "reserved",
  }));

  await assert.rejects(
    service.submit({
      user: { id: "seller-1", role: "SELLER" },
      input: {
        roundId: "round-1",
        productId: "p1",
        startingPrice: 100,
        bidIncrement: 10,
      },
    }),
    (err) => err.status === 400,
  );
});

test("submit creates a pending_approval auction for the owning seller", async (t) => {
  t.mock.method(repository, "findProductOwner", async () => ({
    id: "p1",
    sellerId: "seller-1",
    status: "available",
  }));
  t.mock.method(repository, "create", async (data) => ({
    id: "auction-1",
    ...data,
  }));

  const auction = await service.submit({
    user: { id: "seller-1", role: "SELLER" },
    input: {
      roundId: "round-1",
      productId: "p1",
      startingPrice: 100,
      bidIncrement: 10,
    },
  });

  assert.equal(auction.status, "pending_approval");
  assert.equal(auction.sellerId, "seller-1");
  assert.equal(auction.roundId, "round-1");
});

test("approve rejects a non-Marketing/Admin caller", async () => {
  await assert.rejects(
    service.approve({ user: { id: "u1", role: "BUYER" }, auctionId: "a1" }),
    (err) => err.status === 403,
  );
});

test("approve allows a Marketing caller and transitions to scheduled if round dates exist", async (t) => {
  t.mock.method(repository, "findById", async () => ({
    id: "a1",
    status: "pending_approval",
    scheduledStartAt: new Date(Date.now() + 7200000),
    scheduledEndAt: new Date(Date.now() + 14400000),
  }));
  t.mock.method(repository, "updateStatus", async (id, data) => ({
    id,
    ...data,
  }));

  const res = await service.approve({
    user: { id: "mkt-1", role: "MARKETING" },
    auctionId: "a1",
  });
  assert.equal(res.status, "scheduled");
  assert.equal(res.approvedBy, "mkt-1");
});

test("approve rejects moving out of a non-pending_approval state", async (t) => {
  t.mock.method(repository, "findById", async () => ({
    id: "a1",
    status: "draft",
  }));

  await assert.rejects(
    service.approve({
      user: { id: "mkt-1", role: "MARKETING" },
      auctionId: "a1",
    }),
    (err) => err.status === 409,
  );
});

test("approve rejects non-Marketing callers (including ADMIN)", async () => {
  await assert.rejects(
    service.approve({
      user: { id: "admin-1", role: "ADMIN" },
      auctionId: "a1",
    }),
    (err) => err.status === 403,
  );
});

test("schedule rejects a non-Marketing caller", async () => {
  await assert.rejects(
    service.schedule({
      user: { id: "u1", role: "SELLER" },
      auctionId: "a1",
      startsAt: "2099-01-01T00:00:00.000Z",
      endsAt: "2099-01-02T00:00:00.000Z",
    }),
    (err) => err.status === 403,
  );
});

test("schedule rejects endsAt before startsAt", async (t) => {
  t.mock.method(repository, "findById", async () => ({
    id: "a1",
    status: "approved",
  }));

  await assert.rejects(
    service.schedule({
      user: { id: "mkt-1", role: "MARKETING" },
      auctionId: "a1",
      startsAt: "2099-01-02T00:00:00.000Z",
      endsAt: "2099-01-01T00:00:00.000Z",
    }),
    (err) => err.status === 400,
  );
});

test("schedule accepts a valid window for an approved auction", async (t) => {
  t.mock.method(repository, "findById", async () => ({
    id: "a1",
    status: "approved",
  }));
  t.mock.method(repository, "updateStatus", async (id, data) => ({
    id,
    ...data,
  }));

  const auction = await service.schedule({
    user: { id: "mkt-1", role: "MARKETING" },
    auctionId: "a1",
    startsAt: "2099-01-01T00:00:00.000Z",
    endsAt: "2099-01-02T00:00:00.000Z",
  });

  assert.equal(auction.status, "scheduled");
});

/** A minimal fake Prisma transaction client for placeBid's tx-scoped queries. */
function fakeTx({ auction, existingBid = null, bids = [] }) {
  return {
    auctionItem: {
      findUnique: async () => auction,
      update: async ({ data }) => Object.assign(auction, data),
    },
    bid: {
      findFirst: async () =>
        bids.length
          ? bids.reduce((a, b) => (b.amount > a.amount ? b : a))
          : null,
      create: async ({ data }) => ({ id: "bid-new", ...data }),
      findUnique: async () => existingBid,
    },
  };
}

test("placeBid rejects the seller bidding on their own auction", async (t) => {
  const auction = {
    id: "a1",
    sellerId: "seller-1",
    status: "open",
    startingPrice: 100,
    bidIncrement: 10,
    scheduledEndAt: new Date(Date.now() + 60_000),
  };
  t.mock.method(repository, "withAuctionLock", (id, fn) =>
    fn(fakeTx({ auction })),
  );

  await assert.rejects(
    service.placeBid({
      user: { id: "seller-1" },
      auctionId: "a1",
      amount: 100,
      idempotencyKey: "k1",
    }),
    (err) => err.status === 403,
  );
});

test("placeBid rejects a bid below startingPrice with no existing bids", async (t) => {
  const auction = {
    id: "a1",
    sellerId: "seller-1",
    status: "open",
    startingPrice: 100,
    bidIncrement: 10,
    scheduledEndAt: new Date(Date.now() + 60_000),
  };
  t.mock.method(repository, "withAuctionLock", (id, fn) =>
    fn(fakeTx({ auction })),
  );

  await assert.rejects(
    service.placeBid({
      user: { id: "buyer-1" },
      auctionId: "a1",
      amount: 50,
      idempotencyKey: "k1",
    }),
    (err) => err.status === 400,
  );
});

test("placeBid rejects a bid under the current highest + increment", async (t) => {
  const auction = {
    id: "a1",
    sellerId: "seller-1",
    status: "open",
    startingPrice: 100,
    bidIncrement: 10,
    scheduledEndAt: new Date(Date.now() + 60_000),
  };
  t.mock.method(repository, "withAuctionLock", (id, fn) =>
    fn(fakeTx({ auction, bids: [{ amount: 150 }] })),
  );

  await assert.rejects(
    service.placeBid({
      user: { id: "buyer-1" },
      auctionId: "a1",
      amount: 155,
      idempotencyKey: "k1",
    }),
    (err) =>
      err.status === 400 &&
      err.message.includes("ราคาเสนอประมูลต้องไม่ต่ำกว่า") &&
      err.message.includes("160"),
  );
});

test("placeBid rejects bidding on a closed auction window", async (t) => {
  const auction = {
    id: "a1",
    sellerId: "seller-1",
    status: "open",
    startingPrice: 100,
    bidIncrement: 10,
    scheduledEndAt: new Date(Date.now() - 1000),
  };
  t.mock.method(repository, "withAuctionLock", (id, fn) =>
    fn(fakeTx({ auction })),
  );

  await assert.rejects(
    service.placeBid({
      user: { id: "buyer-1" },
      auctionId: "a1",
      amount: 100,
      idempotencyKey: "k1",
    }),
    (err) => err.status === 409,
  );
});

test("placeBid accepts a valid raise and returns the created bid", async (t) => {
  const auction = {
    id: "a1",
    sellerId: "seller-1",
    status: "open",
    startingPrice: 100,
    bidIncrement: 10,
    scheduledEndAt: new Date(Date.now() + 60_000),
  };
  t.mock.method(repository, "withAuctionLock", (id, fn) =>
    fn(fakeTx({ auction, bids: [{ amount: 100 }] })),
  );

  const bid = await service.placeBid({
    user: { id: "buyer-1" },
    auctionId: "a1",
    amount: 110,
    idempotencyKey: "k1",
  });

  assert.equal(bid.amount, 110);
  assert.equal(bid.bidderId, "buyer-1");
});

test("placeBid returns existing bid on exact retry with matching parameters", async (t) => {
  const auction = {
    id: "a1",
    sellerId: "seller-1",
    status: "open",
    startingPrice: 100,
    bidIncrement: 10,
    scheduledEndAt: new Date(Date.now() + 60_000),
  };
  const existingBid = {
    id: "bid-existing-1",
    auctionId: "a1",
    bidderId: "buyer-1",
    amount: 110,
    idempotencyKey: "k1",
  };
  t.mock.method(repository, "withAuctionLock", (id, fn) =>
    fn(fakeTx({ auction, existingBid })),
  );

  const bid = await service.placeBid({
    user: { id: "buyer-1" },
    auctionId: "a1",
    amount: 110,
    idempotencyKey: "k1",
  });

  assert.equal(bid.id, "bid-existing-1");
  assert.equal(bid.amount, 110);
});

test("placeBid throws 409 Conflict when idempotencyKey is reused with different amount", async (t) => {
  const auction = {
    id: "a1",
    sellerId: "seller-1",
    status: "open",
    startingPrice: 100,
    bidIncrement: 10,
    scheduledEndAt: new Date(Date.now() + 60_000),
  };
  const existingBid = {
    id: "bid-existing-1",
    auctionId: "a1",
    bidderId: "buyer-1",
    amount: 110,
    idempotencyKey: "k1",
  };
  t.mock.method(repository, "withAuctionLock", (id, fn) =>
    fn(fakeTx({ auction, existingBid })),
  );

  await assert.rejects(
    service.placeBid({
      user: { id: "buyer-1" },
      auctionId: "a1",
      amount: 120, // different amount
      idempotencyKey: "k1",
    }),
    (err) => err.status === 409 && err.message.includes("คำขอนี้ถูกส่งซ้ำ"),
  );
});

test("placeBid throws 409 Conflict when idempotencyKey is reused with different bidderId", async (t) => {
  const auction = {
    id: "a1",
    sellerId: "seller-1",
    status: "open",
    startingPrice: 100,
    bidIncrement: 10,
    scheduledEndAt: new Date(Date.now() + 60_000),
  };
  const existingBid = {
    id: "bid-existing-1",
    auctionId: "a1",
    bidderId: "buyer-1",
    amount: 110,
    idempotencyKey: "k1",
  };
  t.mock.method(repository, "withAuctionLock", (id, fn) =>
    fn(fakeTx({ auction, existingBid })),
  );

  await assert.rejects(
    service.placeBid({
      user: { id: "buyer-2" }, // different buyer
      auctionId: "a1",
      amount: 110,
      idempotencyKey: "k1",
    }),
    (err) => err.status === 409 && err.message.includes("คำขอนี้ถูกส่งซ้ำ"),
  );
});

test("placeBid throws 409 Conflict when idempotencyKey is reused with different auctionId", async (t) => {
  const auction = {
    id: "a2",
    sellerId: "seller-1",
    status: "open",
    startingPrice: 100,
    bidIncrement: 10,
    scheduledEndAt: new Date(Date.now() + 60_000),
  };
  const existingBid = {
    id: "bid-existing-1",
    auctionId: "a1", // points to a1
    bidderId: "buyer-1",
    amount: 110,
    idempotencyKey: "k1",
  };
  t.mock.method(repository, "withAuctionLock", (id, fn) =>
    fn(fakeTx({ auction, existingBid })),
  );

  await assert.rejects(
    service.placeBid({
      user: { id: "buyer-1" },
      auctionId: "a2", // bidding on a2
      amount: 110,
      idempotencyKey: "k1",
    }),
    (err) => err.status === 409 && err.message.includes("คำขอนี้ถูกส่งซ้ำ"),
  );
});

test("placeBid returns existing bid on retry even if auction status has changed to closed", async (t) => {
  const auction = {
    id: "a1",
    sellerId: "seller-1",
    status: "closed", // auction is now closed
    startingPrice: 100,
    bidIncrement: 10,
    scheduledEndAt: new Date(Date.now() - 10_000),
  };
  const existingBid = {
    id: "bid-existing-1",
    auctionId: "a1",
    bidderId: "buyer-1",
    amount: 110,
    idempotencyKey: "k1",
  };
  t.mock.method(repository, "withAuctionLock", (id, fn) =>
    fn(fakeTx({ auction, existingBid })),
  );

  const bid = await service.placeBid({
    user: { id: "buyer-1" },
    auctionId: "a1",
    amount: 110,
    idempotencyKey: "k1",
  });

  assert.equal(bid.id, "bid-existing-1");
  assert.equal(bid.amount, 110);
});

test("placeBid P2002 race recovery validates existing bid and returns on match", async (t) => {
  const auction = {
    id: "a1",
    sellerId: "seller-1",
    status: "open",
    startingPrice: 100,
    bidIncrement: 10,
    scheduledEndAt: new Date(Date.now() + 60_000),
  };
  const raceBid = {
    id: "b-race",
    auctionId: "a1",
    bidderId: "buyer-1",
    amount: 110,
    idempotencyKey: "k-race",
  };
  let findCount = 0;
  const tx = {
    auctionItem: {
      findUnique: async () => auction,
      update: async () => {},
    },
    bid: {
      findUnique: async () => {
        findCount++;
        return findCount === 1 ? null : raceBid;
      },
    },
  };
  t.mock.method(repository, "withAuctionLock", (id, fn) => fn(tx));
  t.mock.method(repository, "highestBid", async () => null);
  t.mock.method(repository, "createBid", async () => {
    const err = new Error("P2002");
    err.code = "P2002";
    throw err;
  });

  const res = await service.placeBid({
    user: { id: "buyer-1" },
    auctionId: "a1",
    amount: 110,
    idempotencyKey: "k-race",
  });
  assert.equal(res.id, "b-race");
});

test("placeBid P2002 race recovery throws 409 Conflict if race-created bid has different parameters", async (t) => {
  const auction = {
    id: "a1",
    sellerId: "seller-1",
    status: "open",
    startingPrice: 100,
    bidIncrement: 10,
    scheduledEndAt: new Date(Date.now() + 60_000),
  };
  const raceBid = {
    id: "b-race",
    auctionId: "a1",
    bidderId: "buyer-2",
    amount: 110,
    idempotencyKey: "k-race",
  };
  let findCount = 0;
  const tx = {
    auctionItem: {
      findUnique: async () => auction,
      update: async () => {},
    },
    bid: {
      findUnique: async () => {
        findCount++;
        return findCount === 1 ? null : raceBid;
      },
    },
  };
  t.mock.method(repository, "withAuctionLock", (id, fn) => fn(tx));
  t.mock.method(repository, "highestBid", async () => null);
  t.mock.method(repository, "createBid", async () => {
    const err = new Error("P2002");
    err.code = "P2002";
    throw err;
  });

  await assert.rejects(
    service.placeBid({
      user: { id: "buyer-1" },
      auctionId: "a1",
      amount: 110,
      idempotencyKey: "k-race",
    }),
    (err) => err.status === 409 && err.message.includes("คำขอนี้ถูกส่งซ้ำ"),
  );
});

test("closing an auction with no bids never calls order-service", async (t) => {
  t.mock.method(repository, "findById", async () => ({
    id: "a1",
    status: "open",
    sellerId: "seller-1",
    product: { title: "Test product" },
    scheduledStartAt: new Date(Date.now() - 60_000),
    scheduledEndAt: new Date(Date.now() - 1000),
  }));
  t.mock.method(repository, "highestBid", async () => null);
  let called = false;
  t.mock.method(orderClient, "createOrderFromAuction", async () => {
    called = true;
    return { id: "order-1" };
  });
  t.mock.method(repository, "updateStatus", async (id, data) => ({
    id,
    ...data,
  }));

  const auction = await service.get("a1");

  assert.equal(auction.status, "closed");
  assert.equal(auction.winningBidId, null);
  assert.equal(called, false);
});

test("submit transitions available product to 'auction' status", async (t) => {
  let updatedStatus = null;
  t.mock.method(repository, "findProductOwner", async () => ({
    id: "p1",
    sellerId: "seller-1",
    status: "available",
  }));
  t.mock.method(repository, "setProductStatus", async (productId, status) => {
    updatedStatus = status;
  });
  t.mock.method(repository, "create", async (data) => ({
    id: "auction-1",
    ...data,
  }));

  await service.submit({
    user: { id: "seller-1", role: "SELLER" },
    input: {
      roundId: "round-1",
      productId: "p1",
      startingPrice: 100,
      bidIncrement: 10,
    },
  });

  assert.equal(updatedStatus, "auction");
});

test("submit accepts a product already created with 'auction' status without re-setting", async (t) => {
  let setCalled = false;
  t.mock.method(repository, "findProductOwner", async () => ({
    id: "p1",
    sellerId: "seller-1",
    status: "auction",
  }));
  t.mock.method(repository, "setProductStatus", async () => {
    setCalled = true;
  });
  t.mock.method(repository, "create", async (data) => ({
    id: "auction-1",
    ...data,
  }));

  const auction = await service.submit({
    user: { id: "seller-1", role: "SELLER" },
    input: {
      roundId: "round-1",
      productId: "p1",
      startingPrice: 100,
      bidIncrement: 10,
    },
  });

  assert.equal(auction.status, "pending_approval");
  assert.equal(setCalled, false);
});

test("reject resets product status back to 'available'", async (t) => {
  let revertedStatus = null;
  t.mock.method(repository, "findById", async () => ({
    id: "a1",
    productId: "p1",
    status: "pending_approval",
  }));
  t.mock.method(repository, "setProductStatus", async (productId, status) => {
    revertedStatus = status;
  });
  t.mock.method(repository, "updateStatus", async (id, data) => ({
    id,
    ...data,
  }));

  const result = await service.reject({
    user: { id: "mkt-1", role: "MARKETING" },
    auctionId: "a1",
  });

  assert.equal(result.status, "rejected");
  assert.equal(revertedStatus, "available");
});

test("reject rejects non-Marketing callers (including ADMIN)", async () => {
  await assert.rejects(
    service.reject({
      user: { id: "admin-1", role: "ADMIN" },
      auctionId: "a1",
    }),
    (err) => err.status === 403,
  );
});

test("cancel transitions item to 'cancelled' and product status to 'auction_action_required'", async (t) => {
  let revertedStatus = null;
  const chatClient = require("./chatClient");
  t.mock.method(chatClient, "notifyItemCancelled", async () => ({
    deliveredCount: 1,
    failedCount: 0,
    warnings: [],
  }));
  t.mock.method(repository, "findById", async () => ({
    id: "a1",
    productId: "p1",
    sellerId: "seller-1",
    status: "scheduled",
    product: { id: "p1", title: "Test Product" },
    round: {
      id: "round-1",
      title: "Round 1",
      cancelledAt: null,
      auctionEndsAt: new Date(Date.now() + 3600000),
    },
    bids: [],
  }));
  t.mock.method(repository, "setProductStatus", async (productId, status) => {
    revertedStatus = status;
  });
  t.mock.method(repository, "updateStatus", async (id, data) => ({
    id,
    ...data,
  }));

  const result = await service.cancel({
    user: { id: "mkt-1", role: "MARKETING" },
    auctionId: "a1",
    reason: "สินค้าไม่พร้อมจัดส่ง",
  });

  assert.equal(result.status, "cancelled");
  assert.equal(result.cancellationReason, "สินค้าไม่พร้อมจัดส่ง");
  assert.equal(revertedStatus, "auction_action_required");
});

test("closing an auction with no bids transitions product status to 'auction_action_required'", async (t) => {
  let revertedStatus = null;
  t.mock.method(repository, "findById", async () => ({
    id: "a1",
    productId: "p1",
    status: "open",
    sellerId: "seller-1",
    product: { title: "Test product" },
    scheduledStartAt: new Date(Date.now() - 60_000),
    scheduledEndAt: new Date(Date.now() - 1000),
  }));
  t.mock.method(repository, "highestBid", async () => null);
  t.mock.method(repository, "setProductStatus", async (productId, status) => {
    revertedStatus = status;
  });
  t.mock.method(repository, "updateStatus", async (id, data) => ({
    id,
    ...data,
  }));

  await service.get("a1");

  assert.equal(revertedStatus, "auction_action_required");
});

test("submit rejects when roundId is missing", async () => {
  await assert.rejects(
    service.submit({
      user: { id: "seller-1", role: "SELLER" },
      input: { productId: "p1", startingPrice: 100, bidIncrement: 10 },
    }),
    (err) =>
      err.status === 400 &&
      err.message.includes("กรุณาเลือกรอบประมูลก่อนส่งสินค้าเข้าร่วม"),
  );
});

test("submit rejects when selected roundId is not found", async (t) => {
  t.mock.method(repository, "findRoundForSubmission", async () => null);

  await assert.rejects(
    service.submit({
      user: { id: "seller-1", role: "SELLER" },
      input: {
        roundId: "non-existent-round",
        productId: "p1",
        startingPrice: 100,
        bidIncrement: 10,
      },
    }),
    (err) =>
      err.status === 400 &&
      err.message.includes("ไม่พบรอบประมูลที่เลือก กรุณากลับไปเลือกรอบใหม่"),
  );
});

test("submit rejects when selected round has not started accepting submissions", async (t) => {
  t.mock.method(repository, "findRoundForSubmission", async () => ({
    id: "future-round",
    submissionStartsAt: new Date(Date.now() + 3600000),
    submissionEndsAt: new Date(Date.now() + 7200000),
  }));

  await assert.rejects(
    service.submit({
      user: { id: "seller-1", role: "SELLER" },
      input: {
        roundId: "future-round",
        productId: "p1",
        startingPrice: 100,
        bidIncrement: 10,
      },
    }),
    (err) =>
      err.status === 400 &&
      err.message.includes(
        "รอบประมูลนี้ยังไม่เปิดรับสินค้า กรุณาเลือกรอบที่กำลังเปิดรับ",
      ),
  );
});

test("submit rejects when selected round has expired submission window", async (t) => {
  t.mock.method(repository, "findRoundForSubmission", async () => ({
    id: "expired-round",
    submissionStartsAt: new Date(Date.now() - 7200000),
    submissionEndsAt: new Date(Date.now() - 1000),
  }));

  await assert.rejects(
    service.submit({
      user: { id: "seller-1", role: "SELLER" },
      input: {
        roundId: "expired-round",
        productId: "p1",
        startingPrice: 100,
        bidIncrement: 10,
      },
    }),
    (err) =>
      err.status === 400 &&
      err.message.includes("รอบประมูลนี้ปิดรับสินค้าแล้ว กรุณาเลือกรอบอื่น"),
  );
});

test("createRound rejects non-Marketing/Admin callers", async () => {
  await assert.rejects(
    service.createRound({
      user: { id: "u1", role: "SELLER" },
      input: { title: "Round 1" },
    }),
    (err) => err.status === 403,
  );
});

test("createRound rejects invalid or inverted dates", async () => {
  const user = { id: "mkt-1", role: "MARKETING" };
  // submissionEndsAt before submissionStartsAt
  await assert.rejects(
    service.createRound({
      user,
      input: {
        title: "Round 1",
        submissionStartsAt: "2026-09-10T10:00:00Z",
        submissionEndsAt: "2026-09-09T10:00:00Z",
        auctionStartsAt: "2026-09-11T10:00:00Z",
        auctionEndsAt: "2026-09-12T10:00:00Z",
      },
    }),
    (err) => err.status === 400,
  );
  // auctionStartsAt before submissionEndsAt
  await assert.rejects(
    service.createRound({
      user,
      input: {
        title: "Round 1",
        submissionStartsAt: "2026-09-01T10:00:00Z",
        submissionEndsAt: "2026-09-05T10:00:00Z",
        auctionStartsAt: "2026-09-04T10:00:00Z",
        auctionEndsAt: "2026-09-06T10:00:00Z",
      },
    }),
    (err) => err.status === 400,
  );
});

test("createRound creates round for Marketing user", async (t) => {
  t.mock.method(repository, "createRound", async (data) => ({
    id: "round-1",
    ...data,
  }));

  const round = await service.createRound({
    user: { id: "mkt-1", role: "MARKETING" },
    input: {
      title: "Round 1",
      submissionStartsAt: "2026-09-01T10:00:00Z",
      submissionEndsAt: "2026-09-05T10:00:00Z",
      auctionStartsAt: "2026-09-06T10:00:00Z",
      auctionEndsAt: "2026-09-08T10:00:00Z",
    },
  });

  assert.equal(round.id, "round-1");
  assert.equal(round.title, "Round 1");
});

test("getCurrentRound correctly returns flags when active", async (t) => {
  const now = new Date("2026-09-03T12:00:00Z");
  const activeSubRound = {
    id: "round-1",
    title: "Round 1",
    submissionStartsAt: new Date("2026-09-01T00:00:00Z"),
    submissionEndsAt: new Date("2026-09-05T00:00:00Z"),
    auctionStartsAt: new Date("2026-09-06T00:00:00Z"),
    auctionEndsAt: new Date("2026-09-08T00:00:00Z"),
  };
  t.mock.method(repository, "findActiveSubmissionRounds", async () => [
    activeSubRound,
  ]);
  t.mock.method(repository, "findActiveAuctionRounds", async () => []);
  t.mock.method(repository, "findUpcomingRounds", async () => []);

  const info = await service.getCurrentRound(now);
  assert.equal(info.isSubmissionOpen, true);
  assert.equal(info.isAuctionActive, false);
});

test("placeBid in the last 5 minutes extends scheduledEndAt by 5 minutes and reschedules close job", async (t) => {
  const initialEnd = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes remaining
  let updatedEndAt = null;
  let rescheduledAt = null;

  t.mock.method(repository, "withAuctionLock", async (auctionId, fn) => {
    const tx = {
      auctionItem: {
        findUnique: async () => ({
          id: auctionId,
          sellerId: "seller-1",
          status: "open",
          startingPrice: 100,
          bidIncrement: 10,
          scheduledEndAt: initialEnd,
        }),
        update: async ({ data }) => {
          if (data.scheduledEndAt) updatedEndAt = data.scheduledEndAt;
        },
      },
      bid: {
        findUnique: async () => null,
      },
    };
    return fn(tx);
  });
  t.mock.method(repository, "highestBid", async () => null);
  t.mock.method(repository, "createBid", async (data) => ({
    id: "b1",
    ...data,
  }));
  t.mock.method(
    auctionCloseQueue,
    "scheduleClose",
    async (auctionId, closeAt) => {
      rescheduledAt = closeAt;
    },
  );

  await service.placeBid({
    user: { id: "buyer-1", role: "BUYER" },
    auctionId: "a1",
    amount: 100,
    idempotencyKey: "key-extend-1",
  });

  assert.ok(updatedEndAt, "scheduledEndAt should have been updated");
  assert.equal(
    updatedEndAt.getTime(),
    initialEnd.getTime() + 5 * 60 * 1000,
    "should add exactly 5 minutes",
  );
  assert.equal(rescheduledAt.getTime(), updatedEndAt.getTime());
});

test("placeBid outside the last 5 minutes does NOT extend scheduledEndAt", async (t) => {
  const initialEnd = new Date(Date.now() + 20 * 60 * 1000); // 20 minutes remaining
  let updatedEndAt = null;

  t.mock.method(repository, "withAuctionLock", async (auctionId, fn) => {
    const tx = {
      auctionItem: {
        findUnique: async () => ({
          id: auctionId,
          sellerId: "seller-1",
          status: "open",
          startingPrice: 100,
          bidIncrement: 10,
          scheduledEndAt: initialEnd,
        }),
        update: async ({ data }) => {
          if (data.scheduledEndAt) updatedEndAt = data.scheduledEndAt;
        },
      },
      bid: {
        findUnique: async () => null,
      },
    };
    return fn(tx);
  });
  t.mock.method(repository, "highestBid", async () => null);
  t.mock.method(repository, "createBid", async (data) => ({
    id: "b1",
    ...data,
  }));

  await service.placeBid({
    user: { id: "buyer-1", role: "BUYER" },
    auctionId: "a1",
    amount: 100,
    idempotencyKey: "key-no-extend",
  });

  assert.equal(
    updatedEndAt,
    null,
    "should not extend if remaining > 5 minutes",
  );
});

// ==========================================
// Auction Round Overlap & Phase Unit Tests
// ==========================================

test("deriveRoundPhase correctly identifies all 5 half-open phases", () => {
  const round = {
    submissionStartsAt: new Date("2026-10-01T10:00:00.000Z"),
    submissionEndsAt: new Date("2026-10-02T10:00:00.000Z"),
    auctionStartsAt: new Date("2026-10-02T12:00:00.000Z"),
    auctionEndsAt: new Date("2026-10-03T12:00:00.000Z"),
  };

  // 1. upcoming: now < submissionStartsAt
  assert.equal(
    service.deriveRoundPhase(round, new Date("2026-10-01T09:59:59.999Z")),
    "upcoming",
  );

  // 2. submission: submissionStartsAt <= now && now < submissionEndsAt
  assert.equal(
    service.deriveRoundPhase(round, new Date("2026-10-01T10:00:00.000Z")),
    "submission",
  );
  assert.equal(
    service.deriveRoundPhase(round, new Date("2026-10-02T09:59:59.999Z")),
    "submission",
  );

  // 3. waiting: submissionEndsAt <= now && now < auctionStartsAt
  assert.equal(
    service.deriveRoundPhase(round, new Date("2026-10-02T10:00:00.000Z")),
    "waiting",
  );
  assert.equal(
    service.deriveRoundPhase(round, new Date("2026-10-02T11:59:59.999Z")),
    "waiting",
  );

  // 4. auction: auctionStartsAt <= now && now < auctionEndsAt
  assert.equal(
    service.deriveRoundPhase(round, new Date("2026-10-02T12:00:00.000Z")),
    "auction",
  );
  assert.equal(
    service.deriveRoundPhase(round, new Date("2026-10-03T11:59:59.999Z")),
    "auction",
  );

  // 5. ended: now >= auctionEndsAt
  assert.equal(
    service.deriveRoundPhase(round, new Date("2026-10-03T12:00:00.000Z")),
    "ended",
  );
  assert.equal(
    service.deriveRoundPhase(round, new Date("2026-10-03T12:00:00.001Z")),
    "ended",
  );

  // null round returns null
  assert.equal(service.deriveRoundPhase(null), null);
});

test("createRound rejects non-Marketing user with 403 Forbidden", async () => {
  await assert.rejects(
    service.createRound({
      user: { id: "seller-1", role: "SELLER" },
      input: { title: "Round" },
    }),
    (err) => err.status === 403,
  );
});

test("createRound validates input dates and boundaries", async () => {
  const user = { id: "mkt-1", role: "MARKETING" };

  // Missing title
  await assert.rejects(
    service.createRound({ user, input: { title: "" } }),
    (err) =>
      err.status === 400 &&
      err.message.includes("กรุณากรอกชื่อรอบการประมูลให้ครบถ้วน"),
  );

  // Invalid date
  await assert.rejects(
    service.createRound({
      user,
      input: {
        title: "Test",
        submissionStartsAt: "invalid",
        submissionEndsAt: "2026-10-02T00:00:00.000Z",
        auctionStartsAt: "2026-10-02T00:00:00.000Z",
        auctionEndsAt: "2026-10-03T00:00:00.000Z",
      },
    }),
    (err) => err.status === 400 && err.message.includes("กรุณาระบุวันและเวลา"),
  );

  // submissionEndsAt <= submissionStartsAt
  await assert.rejects(
    service.createRound({
      user,
      input: {
        title: "Test",
        submissionStartsAt: "2026-10-02T00:00:00.000Z",
        submissionEndsAt: "2026-10-01T00:00:00.000Z",
        auctionStartsAt: "2026-10-02T00:00:00.000Z",
        auctionEndsAt: "2026-10-03T00:00:00.000Z",
      },
    }),
    (err) =>
      err.status === 400 &&
      err.message.includes(
        "เวลาปิดรับสินค้าต้องอยู่หลังเวลาเริ่มเปิดรับสินค้า",
      ),
  );

  // auctionStartsAt < submissionEndsAt
  await assert.rejects(
    service.createRound({
      user,
      input: {
        title: "Test",
        submissionStartsAt: "2026-10-01T00:00:00.000Z",
        submissionEndsAt: "2026-10-03T00:00:00.000Z",
        auctionStartsAt: "2026-10-02T00:00:00.000Z",
        auctionEndsAt: "2026-10-04T00:00:00.000Z",
      },
    }),
    (err) =>
      err.status === 400 &&
      err.message.includes(
        "เวลาเริ่มการประมูลต้องอยู่หลังหรือตรงกับเวลาปิดรับสินค้า",
      ),
  );

  // auctionEndsAt <= auctionStartsAt
  await assert.rejects(
    service.createRound({
      user,
      input: {
        title: "Test",
        submissionStartsAt: "2026-10-01T00:00:00.000Z",
        submissionEndsAt: "2026-10-02T00:00:00.000Z",
        auctionStartsAt: "2026-10-03T00:00:00.000Z",
        auctionEndsAt: "2026-10-03T00:00:00.000Z",
      },
    }),
    (err) =>
      err.status === 400 &&
      err.message.includes(
        "เวลาสิ้นสุดการประมูลต้องอยู่หลังเวลาเริ่มการประมูล",
      ),
  );
});

test("createRound succeeds when overlapping round exists (MKT-DEC-025 overlap permitted)", async (t) => {
  const user = { id: "mkt-1", role: "MARKETING" };
  t.mock.method(repository, "createRound", async (data) => ({
    id: "round-overlap-1",
    ...data,
  }));

  const created = await service.createRound({
    user,
    input: {
      title: "Overlapping Round",
      submissionStartsAt: "2026-10-04T00:00:00.000Z",
      submissionEndsAt: "2026-10-06T00:00:00.000Z",
      auctionStartsAt: "2026-10-06T00:00:00.000Z",
      auctionEndsAt: "2026-10-08T00:00:00.000Z",
    },
  });

  assert.equal(created.id, "round-overlap-1");
  assert.equal(created.title, "Overlapping Round");
});

test("createRound succeeds and passes tx when no conflict exists", async (t) => {
  const user = { id: "mkt-1", role: "MARKETING" };
  let createdWithTx = null;

  t.mock.method(repository, "createRound", async (data, tx) => {
    createdWithTx = tx;
    return { id: "round-new-1", ...data };
  });

  const created = await service.createRound({
    user,
    input: {
      title: "Clean Round",
      submissionStartsAt: "2026-10-10T00:00:00.000Z",
      submissionEndsAt: "2026-10-12T00:00:00.000Z",
      auctionStartsAt: "2026-10-12T00:00:00.000Z",
      auctionEndsAt: "2026-10-15T00:00:00.000Z",
    },
  });

  assert.equal(created.id, "round-new-1");
  assert.ok(createdWithTx);
});

test("getCurrentRound returns active round containing now with derived phase", async (t) => {
  const fakeNow = new Date("2026-10-02T05:00:00.000Z");
  const activeRound = {
    id: "round-active",
    title: "Active Round",
    submissionStartsAt: new Date("2026-10-01T00:00:00.000Z"),
    submissionEndsAt: new Date("2026-10-02T12:00:00.000Z"),
    auctionStartsAt: new Date("2026-10-02T12:00:00.000Z"),
    auctionEndsAt: new Date("2026-10-05T00:00:00.000Z"),
  };

  t.mock.method(repository, "findActiveSubmissionRounds", async () => [
    activeRound,
  ]);
  t.mock.method(repository, "findActiveAuctionRounds", async () => []);
  t.mock.method(repository, "findUpcomingRounds", async () => []);

  const result = await service.getCurrentRound(fakeNow);
  assert.equal(result.round.id, "round-active");
  assert.equal(result.phase, "submission");
  assert.equal(result.isSubmissionOpen, true);
  assert.equal(result.isAuctionActive, false);
});

test("getCurrentRound supports simultaneous active submission and auction rounds", async (t) => {
  const fakeNow = new Date("2026-10-02T05:00:00.000Z");
  const subRound = {
    id: "round-sub",
    title: "Submission Round",
    submissionStartsAt: new Date("2026-10-01T00:00:00.000Z"),
    submissionEndsAt: new Date("2026-10-03T00:00:00.000Z"),
    auctionStartsAt: new Date("2026-10-03T12:00:00.000Z"),
    auctionEndsAt: new Date("2026-10-05T00:00:00.000Z"),
  };
  const aucRound = {
    id: "round-auc",
    title: "Live Auction Round",
    submissionStartsAt: new Date("2026-09-25T00:00:00.000Z"),
    submissionEndsAt: new Date("2026-09-28T00:00:00.000Z"),
    auctionStartsAt: new Date("2026-10-01T00:00:00.000Z"),
    auctionEndsAt: new Date("2026-10-04T00:00:00.000Z"),
  };

  t.mock.method(repository, "findActiveSubmissionRounds", async () => [
    subRound,
  ]);
  t.mock.method(repository, "findActiveAuctionRounds", async () => [aucRound]);
  t.mock.method(repository, "findUpcomingRounds", async () => []);

  const result = await service.getCurrentRound(fakeNow);
  assert.equal(result.isSubmissionOpen, true);
  assert.equal(result.isAuctionActive, true);
  assert.equal(result.activeSubmissionRounds.length, 1);
  assert.equal(result.activeAuctionRounds.length, 1);
});

test("getCurrentRound returns nearest upcoming round when none active", async (t) => {
  const fakeNow = new Date("2026-09-20T00:00:00.000Z");
  const upcomingRound = {
    id: "round-upcoming",
    title: "Upcoming Round",
    submissionStartsAt: new Date("2026-10-01T00:00:00.000Z"),
    submissionEndsAt: new Date("2026-10-02T12:00:00.000Z"),
    auctionStartsAt: new Date("2026-10-02T12:00:00.000Z"),
    auctionEndsAt: new Date("2026-10-05T00:00:00.000Z"),
  };

  t.mock.method(repository, "findActiveSubmissionRounds", async () => []);
  t.mock.method(repository, "findActiveAuctionRounds", async () => []);
  t.mock.method(repository, "findUpcomingRounds", async () => [upcomingRound]);

  const result = await service.getCurrentRound(fakeNow);
  assert.equal(result.round.id, "round-upcoming");
  assert.equal(result.phase, "upcoming");
  assert.equal(result.isSubmissionOpen, false);
  assert.equal(result.isAuctionActive, false);
});

test("getCurrentRound returns null when all rounds ended or none exist", async (t) => {
  const fakeNow = new Date("2026-12-01T00:00:00.000Z");

  t.mock.method(repository, "findActiveSubmissionRounds", async () => []);
  t.mock.method(repository, "findActiveAuctionRounds", async () => []);
  t.mock.method(repository, "findUpcomingRounds", async () => []);

  const result = await service.getCurrentRound(fakeNow);
  assert.equal(result.round, null);
  assert.equal(result.phase, null);
  assert.equal(result.isSubmissionOpen, false);
  assert.equal(result.isAuctionActive, false);
});

test("listRounds attaches derived phase to each round", async (t) => {
  const user = { id: "mkt-1", role: "MARKETING" };
  const rounds = [
    {
      id: "r1",
      title: "Round 1",
      submissionStartsAt: new Date(Date.now() - 7200000),
      submissionEndsAt: new Date(Date.now() - 3600000),
      auctionStartsAt: new Date(Date.now() - 3600000),
      auctionEndsAt: new Date(Date.now() - 1800000),
    },
    {
      id: "r2",
      title: "Round 2",
      submissionStartsAt: new Date(Date.now() + 3600000),
      submissionEndsAt: new Date(Date.now() + 7200000),
      auctionStartsAt: new Date(Date.now() + 7200000),
      auctionEndsAt: new Date(Date.now() + 14400000),
    },
  ];

  t.mock.method(repository, "listRounds", async () => rounds);

  const result = await service.listRounds({ user });
  assert.equal(result.length, 2);
  assert.equal(result[0].phase, "ended");
  assert.equal(result[1].phase, "upcoming");
});

test("auction error messages do not leak internal status or English technical terms", async (t) => {
  t.mock.method(repository, "findById", async () => ({
    id: "a1",
    status: "draft",
  }));

  await assert.rejects(
    service.approve({
      user: { id: "mkt-1", role: "MARKETING" },
      auctionId: "a1",
    }),
    (err) => {
      assert.equal(err.status, 409);
      assert.ok(err.message.includes("ไม่สามารถเปลี่ยนสถานะรายการประมูล"));
      assert.ok(err.message.includes("ฉบับร่าง"));
      assert.ok(!err.message.includes("cannot move auction from draft"));
      return true;
    },
  );
});

test("schedule rejects past startsAt with friendly Thai message", async (t) => {
  t.mock.method(repository, "findById", async () => ({
    id: "a1",
    status: "approved",
  }));

  await assert.rejects(
    service.schedule({
      user: { id: "mkt-1", role: "MARKETING" },
      auctionId: "a1",
      startsAt: "2020-01-01T00:00:00.000Z",
      endsAt: "2099-01-01T00:00:00.000Z",
    }),
    (err) => {
      assert.equal(err.status, 400);
      assert.ok(
        err.message.includes("เวลาเปิดประมูลต้องเป็นวันและเวลาในอนาคต"),
      );
      assert.ok(!err.message.includes("startsAt must be in the future"));
      return true;
    },
  );
});

test("schedule rejects endsAt before startsAt with friendly Thai message", async (t) => {
  t.mock.method(repository, "findById", async () => ({
    id: "a1",
    status: "approved",
  }));

  await assert.rejects(
    service.schedule({
      user: { id: "mkt-1", role: "MARKETING" },
      auctionId: "a1",
      startsAt: "2099-01-02T00:00:00.000Z",
      endsAt: "2099-01-01T00:00:00.000Z",
    }),
    (err) => {
      assert.equal(err.status, 400);
      assert.ok(
        err.message.includes("เวลาปิดประมูลต้องอยู่หลังเวลาเปิดประมูล"),
      );
      assert.ok(!err.message.includes("endsAt must be after startsAt"));
      return true;
    },
  );
});

test("placeBid validates missing idempotencyKey with clear Thai message", async () => {
  await assert.rejects(
    service.placeBid({
      user: { id: "buyer-1" },
      auctionId: "a1",
      amount: 100,
      idempotencyKey: "",
    }),
    (err) => {
      assert.equal(err.status, 400);
      assert.ok(err.message.includes("ข้อมูลคำขอไม่สมบูรณ์"));
      assert.ok(!err.message.includes("idempotencyKey is required"));
      return true;
    },
  );
});

test("placeBid validates non-positive amount with clear Thai message", async () => {
  await assert.rejects(
    service.placeBid({
      user: { id: "buyer-1" },
      auctionId: "a1",
      amount: -10,
      idempotencyKey: "key-1",
    }),
    (err) => {
      assert.equal(err.status, 400);
      assert.ok(err.message.includes("จำนวนเงินเสนอราคาต้องเป็นจำนวนเต็มบวก"));
      return true;
    },
  );
});

test("createRound accepts empty categories array or omitted as all categories", async (t) => {
  let createdPayload = null;
  t.mock.method(repository, "createRound", async (data) => {
    createdPayload = data;
    return { id: "round-all", ...data };
  });

  await service.createRound({
    user: { id: "mkt-1", role: "MARKETING" },
    input: {
      title: "All Categories Round",
      submissionStartsAt: "2026-11-01T00:00:00.000Z",
      submissionEndsAt: "2026-11-02T00:00:00.000Z",
      auctionStartsAt: "2026-11-03T00:00:00.000Z",
      auctionEndsAt: "2026-11-04T00:00:00.000Z",
      categories: [],
    },
  });
  assert.deepEqual(createdPayload.categories, []);

  await service.createRound({
    user: { id: "mkt-1", role: "MARKETING" },
    input: {
      title: "Omitted Categories Round",
      submissionStartsAt: "2026-11-05T00:00:00.000Z",
      submissionEndsAt: "2026-11-06T00:00:00.000Z",
      auctionStartsAt: "2026-11-07T00:00:00.000Z",
      auctionEndsAt: "2026-11-08T00:00:00.000Z",
    },
  });
  assert.deepEqual(createdPayload.categories, []);
});

test("createRound accepts one valid category", async (t) => {
  let createdPayload = null;
  t.mock.method(repository, "listCategories", async () => [
    { id: "cat-shoes", name: "รองเท้า" },
  ]);
  t.mock.method(repository, "createRound", async (data) => {
    createdPayload = data;
    return { id: "round-shoes", ...data };
  });

  await service.createRound({
    user: { id: "mkt-1", role: "MARKETING" },
    input: {
      title: "Shoes Round",
      submissionStartsAt: "2026-11-01T00:00:00.000Z",
      submissionEndsAt: "2026-11-02T00:00:00.000Z",
      auctionStartsAt: "2026-11-03T00:00:00.000Z",
      auctionEndsAt: "2026-11-04T00:00:00.000Z",
      categories: ["รองเท้า"],
    },
  });
  assert.deepEqual(createdPayload.categories, ["รองเท้า"]);
});

test("createRound accepts multiple valid categories", async (t) => {
  let createdPayload = null;
  t.mock.method(repository, "listCategories", async () => [
    { id: "cat-shoes", name: "รองเท้า" },
    { id: "cat-bags", name: "กระเป๋า" },
  ]);
  t.mock.method(repository, "createRound", async (data) => {
    createdPayload = data;
    return { id: "round-multi", ...data };
  });

  await service.createRound({
    user: { id: "mkt-1", role: "MARKETING" },
    input: {
      title: "Shoes and Bags Round",
      submissionStartsAt: "2026-11-01T00:00:00.000Z",
      submissionEndsAt: "2026-11-02T00:00:00.000Z",
      auctionStartsAt: "2026-11-03T00:00:00.000Z",
      auctionEndsAt: "2026-11-04T00:00:00.000Z",
      categories: ["รองเท้า", "กระเป๋า"],
    },
  });
  assert.deepEqual(createdPayload.categories, ["รองเท้า", "กระเป๋า"]);
});

test("createRound rejects invalid categories format", async () => {
  await assert.rejects(
    service.createRound({
      user: { id: "mkt-1", role: "MARKETING" },
      input: {
        title: "Bad categories Round",
        submissionStartsAt: "2026-11-01T00:00:00.000Z",
        submissionEndsAt: "2026-11-02T00:00:00.000Z",
        auctionStartsAt: "2026-11-03T00:00:00.000Z",
        auctionEndsAt: "2026-11-04T00:00:00.000Z",
        categories: "not-an-array",
      },
    }),
    (err) => {
      assert.equal(err.status, 400);
      assert.ok(err.message.includes("รูปแบบหมวดหมู่"));
      return true;
    },
  );

  await assert.rejects(
    service.createRound({
      user: { id: "mkt-1", role: "MARKETING" },
      input: {
        title: "Bad categories Round",
        submissionStartsAt: "2026-11-01T00:00:00.000Z",
        submissionEndsAt: "2026-11-02T00:00:00.000Z",
        auctionStartsAt: "2026-11-03T00:00:00.000Z",
        auctionEndsAt: "2026-11-04T00:00:00.000Z",
        categories: [123],
      },
    }),
    (err) => {
      assert.equal(err.status, 400);
      assert.ok(err.message.includes("หมวดหมู่"));
      return true;
    },
  );
});

test("createRound rejects non-existent category in database", async (t) => {
  t.mock.method(repository, "listCategories", async () => []);

  await assert.rejects(
    service.createRound({
      user: { id: "mkt-1", role: "MARKETING" },
      input: {
        title: "Unknown Category Round",
        submissionStartsAt: "2026-11-01T00:00:00.000Z",
        submissionEndsAt: "2026-11-02T00:00:00.000Z",
        auctionStartsAt: "2026-11-03T00:00:00.000Z",
        auctionEndsAt: "2026-11-04T00:00:00.000Z",
        categories: ["หมวดหมู่ที่ไม่มีจริง"],
      },
    }),
    (err) => {
      assert.equal(err.status, 400);
      assert.ok(err.message.includes("ไม่มีอยู่ในระบบ"));
      return true;
    },
  );
});

test("isCategoryAllowedInRound treats empty or missing categories as all categories", () => {
  assert.equal(
    service.isCategoryAllowedInRound({ categories: [] }, "เสื้อผ้า"),
    true,
  );
  assert.equal(
    service.isCategoryAllowedInRound({ categories: null }, "เสื้อผ้า"),
    true,
  );
  assert.equal(service.isCategoryAllowedInRound({}, "เสื้อผ้า"), true);
  assert.equal(
    service.isCategoryAllowedInRound({ categories: ["รองเท้า"] }, "เสื้อผ้า"),
    false,
  );
  assert.equal(
    service.isCategoryAllowedInRound(
      { categories: ["เสื้อผ้า", "รองเท้า"] },
      "เสื้อผ้า",
    ),
    true,
  );
});

test("submit new product creates Product and AuctionItem atomically in same transaction", async (t) => {
  t.mock.method(repository, "findCategory", async (name) => ({
    id: "c1",
    name,
  }));
  t.mock.method(productModel, "listConditions", async () => [
    { value: "like_new" },
  ]);

  let productCreatedWithTx = false;
  let auctionCreatedWithTx = false;
  let createdProduct = null;
  let createdAuction = null;

  t.mock.method(productModel, "create", async (data, tx) => {
    if (tx) productCreatedWithTx = true;
    createdProduct = { id: "prod-new-1", ...data };
    return createdProduct;
  });

  t.mock.method(repository, "create", async (data, tx) => {
    if (tx) auctionCreatedWithTx = true;
    createdAuction = { id: "auction-new-1", ...data };
    return createdAuction;
  });

  const res = await service.submit({
    user: {
      id: "seller-1",
      role: "SELLER",
      kycVerified: true,
      kycStatus: "VERIFIED",
    },
    input: {
      roundId: "round-1",
      title: "เสื้อยืดวินเทจ",
      category: "เสื้อผ้า",
      condition: "like_new",
      startingPrice: 300,
      bidIncrement: 50,
      media: ["img1.jpg", "img2.jpg", "img3.jpg", "img4.jpg"],
    },
  });

  assert.equal(res.id, "auction-new-1");
  assert.equal(res.status, "pending_approval");
  assert.equal(res.productId, "prod-new-1");
  assert.equal(createdProduct.status, "auction");
  assert.equal(createdProduct.category, "เสื้อผ้า");
  assert.equal(productCreatedWithTx, true);
  assert.equal(auctionCreatedWithTx, true);
});

test("submit new product rejects when category is not allowed by active round", async (t) => {
  t.mock.method(repository, "findRoundForSubmission", async () => ({
    id: "round-1",
    title: "Shoes Only Round",
    categories: ["รองเท้า"],
    submissionStartsAt: new Date(Date.now() - 3600000),
    submissionEndsAt: new Date(Date.now() + 3600000),
    auctionStartsAt: new Date(Date.now() + 7200000),
    auctionEndsAt: new Date(Date.now() + 14400000),
  }));
  t.mock.method(repository, "findCategory", async (name) => ({
    id: "c1",
    name,
  }));
  t.mock.method(productModel, "listConditions", async () => [
    { value: "like_new" },
  ]);

  let productCreateCalled = false;
  let auctionCreateCalled = false;
  t.mock.method(productModel, "create", async () => {
    productCreateCalled = true;
  });
  t.mock.method(repository, "create", async () => {
    auctionCreateCalled = true;
  });

  await assert.rejects(
    service.submit({
      user: {
        id: "seller-1",
        role: "SELLER",
        kycVerified: true,
        kycStatus: "VERIFIED",
      },
      input: {
        roundId: "round-1",
        title: "กระเป๋าถือ",
        category: "กระเป๋า",
        condition: "like_new",
        startingPrice: 500,
        bidIncrement: 50,
        media: ["img1.jpg", "img2.jpg", "img3.jpg", "img4.jpg"],
      },
    }),
    (err) => {
      assert.equal(err.status, 400);
      assert.ok(err.message.includes("รอบประมูลนี้ไม่เปิดรับสินค้าหมวดหมู่"));
      return true;
    },
  );

  assert.equal(productCreateCalled, false);
  assert.equal(auctionCreateCalled, false);
});

test("submit new product rejects when category is not found in database", async (t) => {
  t.mock.method(repository, "findRoundForSubmission", async () => ({
    id: "round-1",
    categories: [],
    submissionStartsAt: new Date(Date.now() - 3600000),
    submissionEndsAt: new Date(Date.now() + 3600000),
  }));
  t.mock.method(repository, "findCategory", async () => null);

  await assert.rejects(
    service.submit({
      user: {
        id: "seller-1",
        role: "SELLER",
        kycVerified: true,
        kycStatus: "VERIFIED",
      },
      input: {
        roundId: "round-1",
        title: "ไอเท็มลึกลับ",
        category: "หมวดหมู่ปริศนา",
        condition: "like_new",
        startingPrice: 500,
        bidIncrement: 50,
        media: ["img1.jpg", "img2.jpg", "img3.jpg", "img4.jpg"],
      },
    }),
    (err) => {
      assert.equal(err.status, 400);
      assert.ok(err.message.includes("ไม่มีอยู่ในระบบ"));
      return true;
    },
  );
});

test("submit new product rolls back if product creation fails", async (t) => {
  t.mock.method(repository, "findRoundForSubmission", async () => ({
    id: "round-1",
    categories: ["เสื้อผ้า"],
    submissionStartsAt: new Date(Date.now() - 3600000),
    submissionEndsAt: new Date(Date.now() + 3600000),
  }));
  t.mock.method(repository, "findCategory", async (name) => ({
    id: "c1",
    name,
  }));
  t.mock.method(productModel, "listConditions", async () => [
    { value: "like_new" },
  ]);

  t.mock.method(productModel, "create", async () => {
    throw new Error("DB product insert failed");
  });
  let auctionCreated = false;
  t.mock.method(repository, "create", async () => {
    auctionCreated = true;
  });

  await assert.rejects(
    service.submit({
      user: {
        id: "seller-1",
        role: "SELLER",
        kycVerified: true,
        kycStatus: "VERIFIED",
      },
      input: {
        roundId: "round-1",
        title: "เสื้อยืด",
        category: "เสื้อผ้า",
        condition: "like_new",
        startingPrice: 300,
        bidIncrement: 50,
        media: ["img1.jpg", "img2.jpg", "img3.jpg", "img4.jpg"],
      },
    }),
    (err) => err.message === "DB product insert failed",
  );

  assert.equal(auctionCreated, false);
});

test("submit new product rolls back if auction creation fails", async (t) => {
  t.mock.method(repository, "findRoundForSubmission", async () => ({
    id: "round-1",
    categories: ["เสื้อผ้า"],
    submissionStartsAt: new Date(Date.now() - 3600000),
    submissionEndsAt: new Date(Date.now() + 3600000),
  }));
  t.mock.method(repository, "findCategory", async (name) => ({
    id: "c1",
    name,
  }));
  t.mock.method(productModel, "listConditions", async () => [
    { value: "like_new" },
  ]);

  let productCreated = false;
  t.mock.method(productModel, "create", async (data) => {
    productCreated = true;
    return { id: "p-fail", ...data };
  });
  t.mock.method(repository, "create", async () => {
    throw new Error("DB auction insert failed");
  });

  await assert.rejects(
    service.submit({
      user: {
        id: "seller-1",
        role: "SELLER",
        kycVerified: true,
        kycStatus: "VERIFIED",
      },
      input: {
        roundId: "round-1",
        title: "เสื้อยืด",
        category: "เสื้อผ้า",
        condition: "like_new",
        startingPrice: 300,
        bidIncrement: 50,
        media: ["img1.jpg", "img2.jpg", "img3.jpg", "img4.jpg"],
      },
    }),
    (err) => err.message === "DB auction insert failed",
  );

  assert.equal(productCreated, true);
});

test("submit existing product validates product.category from DB and ignores client category", async (t) => {
  t.mock.method(repository, "findRoundForSubmission", async () => ({
    id: "round-1",
    categories: ["รองเท้า"],
    submissionStartsAt: new Date(Date.now() - 3600000),
    submissionEndsAt: new Date(Date.now() + 3600000),
    auctionStartsAt: new Date(Date.now() + 7200000),
    auctionEndsAt: new Date(Date.now() + 14400000),
  }));

  // Case A: DB has "กระเป๋า" but client lies and claims "รองเท้า" -> MUST REJECT!
  t.mock.method(repository, "findProductOwner", async () => ({
    id: "p-bag",
    sellerId: "seller-1",
    status: "available",
    category: "กระเป๋า",
  }));

  await assert.rejects(
    service.submit({
      user: { id: "seller-1", role: "SELLER" },
      input: {
        roundId: "round-1",
        productId: "p-bag",
        category: "รองเท้า",
        startingPrice: 100,
        bidIncrement: 10,
      },
    }),
    (err) => {
      assert.equal(err.status, 400);
      assert.ok(
        err.message.includes("รอบประมูลนี้ไม่เปิดรับสินค้าหมวดหมู่") &&
          err.message.includes("กระเป๋า"),
      );
      return true;
    },
  );

  // Case B: DB has "รองเท้า", client omitted category -> MUST SUCCEED!
  t.mock.method(repository, "findProductOwner", async () => ({
    id: "p-shoes",
    sellerId: "seller-1",
    status: "available",
    category: "รองเท้า",
  }));
  t.mock.method(repository, "create", async (data) => ({
    id: "a-shoes",
    ...data,
  }));

  const res = await service.submit({
    user: { id: "seller-1", role: "SELLER" },
    input: {
      roundId: "round-1",
      productId: "p-shoes",
      startingPrice: 100,
      bidIncrement: 10,
    },
  });
  assert.equal(res.id, "a-shoes");
});

test("submit rejects sellers with expired or unverified KYC and allows ADMIN", async (t) => {
  // EXPIRED KYC
  await assert.rejects(
    service.submit({
      user: {
        id: "seller-1",
        role: "SELLER",
        kycStatus: "EXPIRED",
        kycVerified: true,
      },
      input: { roundId: "round-1", startingPrice: 100, bidIncrement: 10 },
    }),
    (err) => {
      assert.equal(err.status, 403);
      assert.ok(err.message.includes("expired"));
      return true;
    },
  );

  // INACTIVE_EXPIRED KYC
  await assert.rejects(
    service.submit({
      user: {
        id: "seller-1",
        role: "SELLER",
        kycStatus: "INACTIVE_EXPIRED",
        kycVerified: true,
      },
      input: { roundId: "round-1", startingPrice: 100, bidIncrement: 10 },
    }),
    (err) => {
      assert.equal(err.status, 403);
      assert.ok(err.message.includes("inactive for over 1 year"));
      return true;
    },
  );

  // Unverified KYC (kycVerified: false)
  await assert.rejects(
    service.submit({
      user: {
        id: "seller-1",
        role: "SELLER",
        kycStatus: "PENDING",
        kycVerified: false,
      },
      input: { roundId: "round-1", startingPrice: 100, bidIncrement: 10 },
    }),
    (err) => {
      assert.equal(err.status, 403);
      assert.ok(err.message.includes("identity verification"));
      return true;
    },
  );

  // ADMIN compatibility: ADMIN role bypasses seller verification
  t.mock.method(repository, "findCategory", async (name) => ({
    id: "c1",
    name,
  }));
  t.mock.method(productModel, "listConditions", async () => [
    { value: "like_new" },
  ]);
  t.mock.method(productModel, "create", async (data) => ({
    id: "admin-prod-1",
    ...data,
  }));
  t.mock.method(repository, "create", async (data) => ({
    id: "admin-auc-1",
    ...data,
  }));

  const adminResult = await service.submit({
    user: {
      id: "admin-1",
      role: "ADMIN",
      kycVerified: false,
    },
    input: {
      roundId: "round-1",
      title: "Admin Moderated Listing",
      category: "เสื้อผ้า",
      condition: "like_new",
      startingPrice: 500,
      bidIncrement: 50,
      media: ["img1.jpg", "img2.jpg", "img3.jpg", "img4.jpg"],
    },
  });
  assert.equal(adminResult.id, "admin-auc-1");
});

test("submit rejects and rolls back when round expires between validation and transaction", async (t) => {
  t.mock.method(repository, "findRoundForSubmission", async () => ({
    id: "round-1",
    categories: ["เสื้อผ้า"],
    submissionStartsAt: new Date(Date.now() - 3600000),
    submissionEndsAt: new Date(Date.now() + 3600000),
    auctionStartsAt: new Date(Date.now() + 7200000),
    auctionEndsAt: new Date(Date.now() + 14400000),
  }));
  t.mock.method(repository, "findCategory", async (name) => ({
    id: "c1",
    name,
  }));
  t.mock.method(productModel, "listConditions", async () => [
    { value: "like_new" },
  ]);

  let checkCount = 0;
  // First call in pre-check returns active round; second call in transaction returns expired round
  t.mock.method(repository, "findRoundForSubmission", async (id, tx) => {
    checkCount++;
    if (tx || checkCount > 1) {
      return {
        id: "round-1",
        categories: ["เสื้อผ้า"],
        submissionStartsAt: new Date(Date.now() - 7200000),
        submissionEndsAt: new Date(Date.now() - 1000), // Expired in tx!
        auctionStartsAt: new Date(Date.now() + 7200000),
        auctionEndsAt: new Date(Date.now() + 14400000),
      };
    }
    return {
      id: "round-1",
      categories: ["เสื้อผ้า"],
      submissionStartsAt: new Date(Date.now() - 3600000),
      submissionEndsAt: new Date(Date.now() + 3600000),
      auctionStartsAt: new Date(Date.now() + 7200000),
      auctionEndsAt: new Date(Date.now() + 14400000),
    };
  });

  let productCreated = false;
  let auctionCreated = false;
  t.mock.method(productModel, "create", async () => {
    productCreated = true;
  });
  t.mock.method(repository, "create", async () => {
    auctionCreated = true;
  });

  await assert.rejects(
    service.submit({
      user: {
        id: "seller-1",
        role: "SELLER",
        kycVerified: true,
        kycStatus: "VERIFIED",
      },
      input: {
        roundId: "round-1",
        title: "เสื้อยืดหมดเวลา",
        category: "เสื้อผ้า",
        condition: "like_new",
        startingPrice: 300,
        bidIncrement: 50,
        media: ["img1.jpg", "img2.jpg", "img3.jpg", "img4.jpg"],
      },
    }),
    (err) => {
      assert.equal(err.status, 400);
      assert.ok(
        err.message.includes("ปิดรับสินค้าแล้ว") ||
          err.message.includes("หมดเวลา"),
      );
      return true;
    },
  );

  assert.equal(productCreated, false);
  assert.equal(auctionCreated, false);
});

test("submit existing product rejects and does not update status when round expires in transaction", async (t) => {
  t.mock.method(repository, "findProductOwner", async () => ({
    id: "p-shoes",
    sellerId: "seller-1",
    status: "available",
    category: "รองเท้า",
  }));

  let checkCount = 0;
  // First call returns active round; tx call returns expired round
  t.mock.method(repository, "findRoundForSubmission", async (id, tx) => {
    checkCount++;
    if (tx || checkCount > 1) {
      return {
        id: "round-1",
        categories: ["รองเท้า"],
        submissionStartsAt: new Date(Date.now() - 7200000),
        submissionEndsAt: new Date(Date.now() - 1000),
        auctionStartsAt: new Date(Date.now() + 7200000),
        auctionEndsAt: new Date(Date.now() + 14400000),
      };
    }
    return {
      id: "round-1",
      categories: ["รองเท้า"],
      submissionStartsAt: new Date(Date.now() - 3600000),
      submissionEndsAt: new Date(Date.now() + 3600000),
      auctionStartsAt: new Date(Date.now() + 7200000),
      auctionEndsAt: new Date(Date.now() + 14400000),
    };
  });

  let productStatusUpdated = false;
  let auctionCreated = false;
  t.mock.method(repository, "setProductStatus", async () => {
    productStatusUpdated = true;
  });
  t.mock.method(repository, "create", async () => {
    auctionCreated = true;
  });

  await assert.rejects(
    service.submit({
      user: { id: "seller-1", role: "SELLER" },
      input: {
        roundId: "round-1",
        productId: "p-shoes",
        startingPrice: 100,
        bidIncrement: 10,
      },
    }),
    (err) => {
      assert.equal(err.status, 400);
      assert.ok(
        err.message.includes("ปิดรับสินค้าแล้ว") ||
          err.message.includes("หมดเวลา"),
      );
      return true;
    },
  );

  assert.equal(productStatusUpdated, false);
  assert.equal(auctionCreated, false);
});

test("browseRounds returns active and upcoming rounds with derived phases", async (t) => {
  const fakeNow = new Date("2026-10-02T12:00:00.000Z");
  const activeRound = {
    id: "r-active",
    title: "Active Round",
    submissionStartsAt: new Date("2026-10-01T00:00:00.000Z"),
    submissionEndsAt: new Date("2026-10-02T00:00:00.000Z"),
    auctionStartsAt: new Date("2026-10-02T00:00:00.000Z"),
    auctionEndsAt: new Date("2026-10-04T00:00:00.000Z"),
  };
  const upcomingRound = {
    id: "r-upcoming",
    title: "Upcoming Round",
    submissionStartsAt: new Date("2026-10-03T00:00:00.000Z"),
    submissionEndsAt: new Date("2026-10-04T00:00:00.000Z"),
    auctionStartsAt: new Date("2026-10-04T00:00:00.000Z"),
    auctionEndsAt: new Date("2026-10-06T00:00:00.000Z"),
  };

  t.mock.method(repository, "findActiveAuctionRounds", async () => [
    activeRound,
  ]);
  t.mock.method(repository, "findUpcomingRounds", async () => [upcomingRound]);

  const result = await service.browseRounds(fakeNow);
  assert.equal(result.activeAuctionRounds.length, 1);
  assert.equal(result.activeAuctionRounds[0].id, "r-active");
  assert.equal(result.activeAuctionRounds[0].phase, "auction");
  assert.equal(result.upcomingRounds.length, 1);
  assert.equal(result.upcomingRounds[0].id, "r-upcoming");
  assert.equal(result.upcomingRounds[0].phase, "upcoming");
});

test("getRound returns round with phase and rejects invalid roundId", async (t) => {
  const fakeNow = new Date("2026-10-02T12:00:00.000Z");
  await assert.rejects(
    service.getRound("", fakeNow),
    (err) =>
      err.status === 400 && err.message.includes("กรุณาระบุรหัสรอบการประมูล"),
  );

  t.mock.method(repository, "findRoundForSubmission", async (id) => {
    if (id === "r-found") {
      return {
        id: "r-found",
        title: "Found Round",
        submissionStartsAt: new Date("2026-10-01T00:00:00.000Z"),
        submissionEndsAt: new Date("2026-10-03T00:00:00.000Z"),
        auctionStartsAt: new Date("2026-10-03T00:00:00.000Z"),
        auctionEndsAt: new Date("2026-10-05T00:00:00.000Z"),
      };
    }
    return null;
  });

  await assert.rejects(
    service.getRound("r-missing", fakeNow),
    (err) =>
      err.status === 404 && err.message.includes("ไม่พบรอบประมูลที่เลือก"),
  );

  const found = await service.getRound("r-found", fakeNow);
  assert.equal(found.id, "r-found");
  assert.equal(found.phase, "submission");
});

test("listRoundItems returns round and items filtered by roundId", async (t) => {
  const fakeNow = new Date("2026-10-02T12:00:00.000Z");
  await assert.rejects(
    service.listRoundItems("", fakeNow),
    (err) =>
      err.status === 400 && err.message.includes("กรุณาระบุรหัสรอบการประมูล"),
  );

  t.mock.method(repository, "findRoundWithItems", async (id) => {
    if (id === "r-items") {
      return {
        id: "r-items",
        title: "Round with Items",
        submissionStartsAt: new Date("2026-10-01T00:00:00.000Z"),
        submissionEndsAt: new Date("2026-10-02T00:00:00.000Z"),
        auctionStartsAt: new Date("2026-10-02T00:00:00.000Z"),
        auctionEndsAt: new Date("2026-10-04T00:00:00.000Z"),
        auctions: [
          {
            id: "a1",
            status: "open",
            startingPrice: 100,
            scheduledStartAt: new Date("2026-10-02T00:00:00.000Z"),
            scheduledEndAt: new Date("2026-10-04T00:00:00.000Z"),
          },
          {
            id: "a2",
            status: "scheduled",
            startingPrice: 200,
            scheduledStartAt: new Date("2026-10-03T00:00:00.000Z"),
            scheduledEndAt: new Date("2026-10-04T00:00:00.000Z"),
          },
        ],
      };
    }
    return null;
  });

  await assert.rejects(
    service.listRoundItems("r-missing", fakeNow),
    (err) => err.status === 404,
  );

  const result = await service.listRoundItems("r-items", fakeNow);
  assert.equal(result.round.id, "r-items");
  assert.equal(result.round.phase, "auction");
  assert.equal(result.items.length, 2);
  assert.equal(result.round.visibleItemCount, 2);
  assert.equal(result.items[0].id, "a1");
  assert.equal(result.items[1].id, "a2");
});

test("listRoundItems reconciles scheduled items to open and filters out expired/closed items", async (t) => {
  const fakeNow = new Date("2026-10-03T12:00:00.000Z");
  let updatedStatusCount = 0;

  t.mock.method(repository, "updateStatus", async (id, data) => {
    updatedStatusCount++;
    return {
      id,
      status: data.status,
      scheduledStartAt: new Date("2026-10-02T00:00:00.000Z"),
      scheduledEndAt: new Date("2026-10-04T00:00:00.000Z"),
    };
  });

  t.mock.method(repository, "findById", async (id) => ({
    id,
    productId: `prod-${id}`,
    product: { title: `Product ${id}` },
    sellerId: "seller-1",
    status: "open",
    scheduledStartAt: new Date("2026-10-01T00:00:00.000Z"),
    scheduledEndAt: new Date("2026-10-02T00:00:00.000Z"),
  }));

  t.mock.method(repository, "highestBid", async () => null);
  t.mock.method(repository, "setProductStatus", async () => {});

  t.mock.method(repository, "transaction", async (fn) => {
    const tx = {
      auctionItem: {
        findUnique: async ({ where }) => ({
          id: where.id,
          productId: `prod-${where.id}`,
          status: "open",
          product: { title: `Product ${where.id}`, photos: [] },
          round: true,
        }),
      },
      marketingAuditLog: {
        create: async () => ({ id: "audit-close" }),
        createMany: async () => ({ count: 1 }),
        findUnique: async () => ({ id: "audit-close" }),
      },
    };
    return fn(tx);
  });

  t.mock.method(repository, "findRoundWithItems", async (id) => ({
    id,
    title: "Reconciled Round",
    submissionStartsAt: new Date("2026-10-01T00:00:00.000Z"),
    submissionEndsAt: new Date("2026-10-02T00:00:00.000Z"),
    auctionStartsAt: new Date("2026-10-02T00:00:00.000Z"),
    auctionEndsAt: new Date("2026-10-05T00:00:00.000Z"),
    auctions: [
      // 1. Scheduled item whose start time has arrived -> should advance to open
      {
        id: "item-advance",
        status: "scheduled",
        startingPrice: 500,
        scheduledStartAt: new Date("2026-10-02T00:00:00.000Z"),
        scheduledEndAt: new Date("2026-10-04T00:00:00.000Z"),
      },
      // 2. Open item whose end time has passed -> should be closed and filtered out
      {
        id: "item-expired",
        status: "open",
        startingPrice: 300,
        scheduledStartAt: new Date("2026-10-01T00:00:00.000Z"),
        scheduledEndAt: new Date("2026-10-02T00:00:00.000Z"),
      },
      // 3. Still active open item -> remains open and returned
      {
        id: "item-active",
        status: "open",
        startingPrice: 700,
        scheduledStartAt: new Date("2026-10-02T00:00:00.000Z"),
        scheduledEndAt: new Date("2026-10-05T00:00:00.000Z"),
      },
    ],
  }));

  const result = await service.listRoundItems("r-reconcile", fakeNow);

  // Exactly 2 items returned (the advanced one and the still active one; the expired one was closed and filtered)
  assert.equal(result.items.length, 2);
  assert.equal(result.round.visibleItemCount, 2);
  const itemIds = result.items.map((i) => i.id);
  assert.ok(itemIds.includes("item-advance"));
  assert.ok(itemIds.includes("item-active"));
  assert.ok(!itemIds.includes("item-expired"));

  const advanced = result.items.find((i) => i.id === "item-advance");
  assert.equal(advanced.status, "open");
  assert.ok(updatedStatusCount >= 1);
});

test("createRound supports concurrent round creation with overlapping times and creates audit log for each", async (t) => {
  const user = { id: "mkt-1", role: "MARKETING" };
  const auditLogs = [];

  t.mock.method(repository, "transaction", async (fn) => {
    const tx = {
      marketingAuditLog: {
        create: async ({ data }) => {
          auditLogs.push(data);
          return { id: `audit-${auditLogs.length}`, ...data };
        },
      },
    };
    return fn(tx);
  });

  t.mock.method(repository, "createRound", async (data) => ({
    id: `round-${data.title}`,
    ...data,
  }));

  const round1Promise = service.createRound({
    user,
    input: {
      title: "Round A",
      submissionStartsAt: "2026-10-01T00:00:00.000Z",
      submissionEndsAt: "2026-10-05T00:00:00.000Z",
      auctionStartsAt: "2026-10-05T00:00:00.000Z",
      auctionEndsAt: "2026-10-10T00:00:00.000Z",
    },
  });

  const round2Promise = service.createRound({
    user,
    input: {
      title: "Round B (Overlapping)",
      submissionStartsAt: "2026-10-02T00:00:00.000Z",
      submissionEndsAt: "2026-10-06T00:00:00.000Z",
      auctionStartsAt: "2026-10-06T00:00:00.000Z",
      auctionEndsAt: "2026-10-11T00:00:00.000Z",
    },
  });

  const [r1, r2] = await Promise.all([round1Promise, round2Promise]);
  assert.equal(r1.id, "round-Round A");
  assert.equal(r2.id, "round-Round B (Overlapping)");
  assert.equal(auditLogs.length, 2);
  assert.equal(auditLogs[0].action, "AUCTION_ROUND_CREATE");
  assert.equal(auditLogs[1].action, "AUCTION_ROUND_CREATE");
});

test("deriveRoundPhase returns 'cancelled' when round.cancelledAt is set", () => {
  const round = {
    submissionStartsAt: new Date(Date.now() - 3600000),
    submissionEndsAt: new Date(Date.now() + 3600000),
    auctionStartsAt: new Date(Date.now() + 7200000),
    auctionEndsAt: new Date(Date.now() + 14400000),
    cancelledAt: new Date(),
  };
  assert.equal(service.deriveRoundPhase(round), "cancelled");
});

test("cancelRound rejects non-Marketing user with 403 Forbidden", async () => {
  await assert.rejects(
    service.cancelRound({
      user: { id: "seller-1", role: "SELLER" },
      roundId: "round-1",
      reason: "เหตุผลขอยกเลิก",
    }),
    (err) => err.status === 403,
  );
});

test("cancelRound validates cancellation reason", async () => {
  const user = { id: "mkt-1", role: "MARKETING" };
  await assert.rejects(
    service.cancelRound({ user, roundId: "round-1", reason: "" }),
    (err) => err.status === 400 && err.message.includes("กรุณาระบุเหตุผล"),
  );
  await assert.rejects(
    service.cancelRound({ user, roundId: "round-1", reason: "   " }),
    (err) => err.status === 400 && err.message.includes("กรุณาระบุเหตุผล"),
  );
  await assert.rejects(
    service.cancelRound({ user, roundId: "round-1", reason: "a".repeat(501) }),
    (err) => err.status === 400 && err.message.includes("500"),
  );
});

test("cancelRound rejects non-existent round with 404", async (t) => {
  const user = { id: "mkt-1", role: "MARKETING" };
  t.mock.method(repository, "withRoundLock", async (roundId, fn) => {
    const tx = {
      auctionRound: {
        findUnique: async () => null,
      },
    };
    return fn(tx);
  });

  await assert.rejects(
    service.cancelRound({
      user,
      roundId: "round-nonexistent",
      reason: "ยกเลิก",
    }),
    (err) => err.status === 404,
  );
});

test("cancelRound on already cancelled round performs idempotent notification retry without mutating state or creating duplicate audit logs", async (t) => {
  const user = { id: "mkt-1", role: "MARKETING" };
  let updateCalls = 0;
  let auditCalls = 0;
  let notifyCalls = 0;

  const chatClient = require("./chatClient");
  t.mock.method(chatClient, "notifyRoundCancelled", async (params) => {
    notifyCalls++;
    assert.equal(params.round.id, "round-1");
    assert.equal(params.round.cancellationReason, "เหตุผลเดิมที่บันทึกไว้");
    assert.deepEqual(params.sellerIds, ["seller-1"]);
    assert.deepEqual(params.bidderIds, ["buyer-1"]);
    return { deliveredCount: 2, failedCount: 0, warnings: [] };
  });

  t.mock.method(repository, "withRoundLock", async (roundId, fn) => {
    const tx = {
      auctionRound: {
        findUnique: async () => ({
          id: "round-1",
          title: "รอบทดสอบ",
          cancelledAt: new Date("2026-04-10T10:00:00Z"),
          cancelledBy: "mkt-1",
          cancellationReason: "เหตุผลเดิมที่บันทึกไว้",
          auctions: [
            {
              id: "item-1",
              productId: "prod-1",
              sellerId: "seller-1",
              status: "cancelled",
              bids: [{ bidderId: "buyer-1", amount: 300 }],
            },
          ],
        }),
        update: async () => {
          updateCalls++;
        },
      },
      marketingAuditLog: {
        create: async () => {
          auditCalls++;
        },
      },
    };
    return fn(tx);
  });

  const result = await service.cancelRound({
    user,
    roundId: "round-1",
    reason: "กดลองส่งแจ้งเตือนซ้ำ",
  });

  assert.equal(result.id, "round-1");
  assert.equal(result.phase, "cancelled");
  assert.equal(result.cancellationReason, "เหตุผลเดิมที่บันทึกไว้");
  assert.equal(updateCalls, 0);
  assert.equal(auditCalls, 0);
  assert.equal(notifyCalls, 1);
  assert.deepEqual(result.warnings, []);
});

test("cancelRound rejects ended round with 400", async (t) => {
  const user = { id: "mkt-1", role: "MARKETING" };
  t.mock.method(repository, "withRoundLock", async (roundId, fn) => {
    const tx = {
      auctionRound: {
        findUnique: async () => ({
          id: "round-1",
          submissionStartsAt: new Date(Date.now() - 4000000),
          submissionEndsAt: new Date(Date.now() - 3000000),
          auctionStartsAt: new Date(Date.now() - 2000000),
          auctionEndsAt: new Date(Date.now() - 1000000),
          auctions: [],
        }),
      },
    };
    return fn(tx);
  });

  await assert.rejects(
    service.cancelRound({ user, roundId: "round-1", reason: "ยกเลิก" }),
    (err) => err.status === 400 && err.message.includes("สิ้นสุดแล้ว"),
  );
});

test("cancelRound rejects round with winning order with 400", async (t) => {
  const user = { id: "mkt-1", role: "MARKETING" };
  t.mock.method(repository, "withRoundLock", async (roundId, fn) => {
    const tx = {
      auctionRound: {
        findUnique: async () => ({
          id: "round-1",
          submissionStartsAt: new Date(Date.now() - 4000000),
          submissionEndsAt: new Date(Date.now() - 3000000),
          auctionStartsAt: new Date(Date.now() - 2000000),
          auctionEndsAt: new Date(Date.now() + 1000000),
          auctions: [
            { id: "a1", winningOrderId: "order-123", status: "closed" },
          ],
        }),
      },
    };
    return fn(tx);
  });

  await assert.rejects(
    service.cancelRound({ user, roundId: "round-1", reason: "ยกเลิก" }),
    (err) => err.status === 400 && err.message.includes("สร้างคำสั่งซื้อ"),
  );
});

test("cancelRound atomically transitions items and products, logs audit, and notifies chat", async (t) => {
  const user = { id: "mkt-1", role: "MARKETING" };
  const updatedItems = [];
  const updatedProducts = [];
  const auditLogs = [];
  const cancelledJobs = [];
  let notifiedRound = null;

  t.mock.method(auctionCloseQueue, "cancelClose", async (id) => {
    cancelledJobs.push(id);
  });

  const chatClient = require("./chatClient");
  t.mock.method(chatClient, "notifyRoundCancelled", async (params) => {
    notifiedRound = params;
    return { deliveredCount: 2, failedCount: 0, warnings: [] };
  });

  t.mock.method(repository, "withRoundLock", async (roundId, fn) => {
    const tx = {
      auctionRound: {
        findUnique: async () => ({
          id: "round-1",
          title: "รอบทดสอบ",
          submissionStartsAt: new Date(Date.now() - 4000000),
          submissionEndsAt: new Date(Date.now() - 3000000),
          auctionStartsAt: new Date(Date.now() - 2000000),
          auctionEndsAt: new Date(Date.now() + 1000000),
          auctions: [
            {
              id: "item-1",
              productId: "prod-1",
              sellerId: "seller-1",
              status: "open",
              bids: [{ bidderId: "buyer-1", amount: 200 }],
            },
            {
              id: "item-2",
              productId: "prod-2",
              sellerId: "seller-2",
              status: "scheduled",
              bids: [],
            },
          ],
        }),
        update: async ({ data }) => ({
          id: "round-1",
          title: "รอบทดสอบ",
          ...data,
        }),
      },
      auctionItem: {
        updateMany: async ({ where, data }) => {
          updatedItems.push({ where, data });
          return { count: 2 };
        },
      },
      product: {
        updateMany: async ({ where, data }) => {
          updatedProducts.push({ where, data });
          return { count: 2 };
        },
      },
      marketingAuditLog: {
        create: async ({ data }) => {
          auditLogs.push(data);
          return { id: "audit-cancel", ...data };
        },
        createMany: async ({ data }) => {
          if (Array.isArray(data)) auditLogs.push(...data);
          else auditLogs.push(data);
          return { count: Array.isArray(data) ? data.length : 1 };
        },
        findUnique: async () => ({ id: "audit-cancel" }),
      },
    };
    return fn(tx);
  });

  const result = await service.cancelRound({
    user,
    roundId: "round-1",
    reason: "เกิดเหตุขัดข้องทางเทคนิค",
  });

  assert.equal(result.id, "round-1");
  assert.equal(result.phase, "cancelled");
  assert.equal(result.cancellationReason, "เกิดเหตุขัดข้องทางเทคนิค");
  assert.equal(result.cancelledBy, "mkt-1");

  assert.equal(updatedItems.length, 1);
  assert.equal(updatedItems[0].data.status, "cancelled");

  assert.equal(updatedProducts.length, 1);
  assert.equal(updatedProducts[0].data.status, "auction_action_required");

  assert.equal(auditLogs.length, 1);
  assert.equal(auditLogs[0].action, "AUCTION_ROUND_CANCEL");
  assert.equal(auditLogs[0].metadata.affectedItemCount, 2);
  assert.equal(auditLogs[0].metadata.affectedSellerCount, 2);

  assert.deepEqual(cancelledJobs.sort(), ["item-1", "item-2"]);

  assert.ok(notifiedRound);
  assert.equal(notifiedRound.round.id, "round-1");
  assert.deepEqual(notifiedRound.sellerIds.sort(), ["seller-1", "seller-2"]);
  assert.deepEqual(notifiedRound.bidderIds, ["buyer-1"]);
});

test("cancelRound returns warnings if chat notification encounters failures", async (t) => {
  const user = { id: "mkt-1", role: "MARKETING" };
  const chatClient = require("./chatClient");
  t.mock.method(chatClient, "notifyRoundCancelled", async () => {
    return {
      deliveredCount: 0,
      failedCount: 1,
      warnings: ["ส่งข้อความแจ้งเตือนไม่สำเร็จ 1 รายการ"],
    };
  });

  t.mock.method(repository, "withRoundLock", async (roundId, fn) => {
    const tx = {
      auctionRound: {
        findUnique: async () => ({
          id: "round-1",
          title: "รอบทดสอบ",
          submissionStartsAt: new Date(Date.now() - 4000000),
          submissionEndsAt: new Date(Date.now() + 1000000),
          auctionStartsAt: new Date(Date.now() + 2000000),
          auctionEndsAt: new Date(Date.now() + 3000000),
          auctions: [],
        }),
        update: async ({ data }) => ({
          id: "round-1",
          ...data,
        }),
      },
      marketingAuditLog: {
        create: async ({ data }) => ({ id: "audit-1", ...data }),
        createMany: async () => ({ count: 1 }),
        findUnique: async () => ({ id: "audit-1" }),
      },
    };
    return fn(tx);
  });

  const result = await service.cancelRound({
    user,
    roundId: "round-1",
    reason: "ยกเลิกรอบเพื่อปรับตาราง",
  });

  assert.equal(result.phase, "cancelled");
  assert.equal(result.warnings.length, 1);
  assert.ok(result.warnings[0].includes("ส่งข้อความแจ้งเตือนไม่สำเร็จ"));
});

test("submit rejects submission to a cancelled round", async (t) => {
  t.mock.method(repository, "findRoundForSubmission", async () => ({
    id: "round-1",
    submissionStartsAt: new Date(Date.now() - 3600000),
    submissionEndsAt: new Date(Date.now() + 3600000),
    cancelledAt: new Date(),
  }));

  await assert.rejects(
    service.submit({
      user: { id: "seller-1", role: "SELLER" },
      input: {
        roundId: "round-1",
        productId: "p1",
        startingPrice: 100,
        bidIncrement: 10,
      },
    }),
    (err) => err.status === 400 && err.message.includes("ถูกยกเลิกแล้ว"),
  );
});

test("submit allows product with auction_action_required status into a new round", async (t) => {
  const seller = { id: "seller-1", role: "SELLER" };
  t.mock.method(repository, "findProductOwner", async () => ({
    id: "prod-recovery",
    sellerId: "seller-1",
    status: "auction_action_required",
    category: "แฟชั่น",
  }));
  t.mock.method(repository, "findCategory", async () => ({ name: "แฟชั่น" }));
  t.mock.method(repository, "findActiveAuctionByProductId", async () => null);

  let updatedProductStatus = null;
  t.mock.method(repository, "setProductStatus", async (id, status) => {
    updatedProductStatus = status;
  });

  t.mock.method(repository, "transaction", async (fn) => {
    const tx = {
      auctionRound: {
        findUnique: async () => ({
          id: "round-new",
          categories: ["แฟชั่น"],
          submissionStartsAt: new Date(Date.now() - 10000),
          submissionEndsAt: new Date(Date.now() + 100000),
          cancelledAt: null,
        }),
      },
      auctionItem: {
        create: async ({ data }) => ({ id: "item-new", ...data }),
      },
    };
    return fn(tx);
  });

  const result = await service.submit({
    user: seller,
    input: {
      roundId: "round-new",
      productId: "prod-recovery",
      startingPrice: 500,
      bidIncrement: 50,
    },
  });

  assert.equal(result.id, "item-new");
  assert.equal(result.status, "pending_approval");
  assert.equal(updatedProductStatus, "auction");
});

test("approve rejects item in a cancelled round", async (t) => {
  const user = { id: "mkt-1", role: "MARKETING" };
  t.mock.method(repository, "findById", async () => ({
    id: "item-1",
    status: "pending_approval",
    round: {
      id: "round-1",
      cancelledAt: new Date(),
    },
  }));

  await assert.rejects(
    service.approve({ user, auctionId: "item-1" }),
    (err) =>
      err.status === 400 && err.message.includes("รอบประมูลที่ถูกยกเลิก"),
  );
});

test("placeBid rejects bid when round or item is cancelled", async (t) => {
  const user = { id: "buyer-1", role: "BUYER" };
  t.mock.method(repository, "withAuctionLock", async (auctionId, fn) => {
    const tx = {
      auctionItem: {
        findUnique: async () => ({
          id: "item-1",
          status: "open",
          round: { id: "round-1", cancelledAt: new Date() },
          bids: [],
        }),
      },
    };
    return fn(tx);
  });

  await assert.rejects(
    service.placeBid({
      user,
      auctionId: "item-1",
      amount: 500,
      idempotencyKey: "bid-key-1",
    }),
    (err) => err.status === 409 && err.message.includes("ยกเลิก"),
  );

  t.mock.method(repository, "withAuctionLock", async (auctionId, fn) => {
    const tx = {
      auctionItem: {
        findUnique: async () => ({
          id: "item-1",
          status: "cancelled",
          round: { id: "round-1", cancelledAt: null },
          bids: [],
        }),
      },
    };
    return fn(tx);
  });

  await assert.rejects(
    service.placeBid({
      user,
      auctionId: "item-1",
      amount: 500,
      idempotencyKey: "bid-key-2",
    }),
    (err) => err.status === 409 && err.message.includes("ยกเลิก"),
  );
});

test("closeAuction transitions product to auction_action_required when there are 0 bids", async (t) => {
  let updatedProductStatus = null;
  t.mock.method(repository, "findById", async () => ({
    id: "item-no-bid",
    status: "open",
    productId: "prod-no-bid",
    round: { id: "round-1", cancelledAt: null },
    product: { title: "Item No Bid", photos: [] },
  }));
  t.mock.method(repository, "highestBid", async () => null);
  t.mock.method(repository, "setProductStatus", async (id, status) => {
    updatedProductStatus = status;
  });
  t.mock.method(repository, "transaction", async (fn) => {
    const tx = {
      auctionItem: {
        findUnique: async () => ({
          id: "item-no-bid",
          status: "open",
          productId: "prod-no-bid",
          round: { id: "round-1", cancelledAt: null },
          product: { photos: [] },
        }),
        update: async ({ data }) => ({
          id: "item-no-bid",
          status: data.status,
          bids: [],
        }),
      },
      marketingAuditLog: {
        create: async () => ({ id: "audit-1" }),
        createMany: async () => ({ count: 1 }),
        findUnique: async () => ({ id: "audit-1" }),
      },
    };
    return fn(tx);
  });

  const result = await service.closeAuction("item-no-bid");
  assert.equal(result.status, "closed");
  assert.equal(updatedProductStatus, "auction_action_required");
});

// ==========================================
// Single-Item Cancellation (MKT-DEC-026)
// ==========================================

test("cancel rejects non-Marketing callers with 403", async () => {
  await assert.rejects(
    service.cancel({
      user: { id: "seller-1", role: "SELLER" },
      auctionId: "item-1",
      reason: "ยกเลิกรายการ",
    }),
    (err) => err.status === 403,
  );
  await assert.rejects(
    service.cancel({
      user: { id: "admin-1", role: "ADMIN" },
      auctionId: "item-1",
      reason: "ยกเลิกรายการ",
    }),
    (err) => err.status === 403,
  );
});

test("cancel validates cancellation reason (non-empty and <= 500 chars)", async () => {
  const user = { id: "mkt-1", role: "MARKETING" };
  await assert.rejects(
    service.cancel({ user, auctionId: "item-1", reason: "" }),
    (err) =>
      err.status === 400 &&
      err.message.includes("กรุณาระบุเหตุผลในการยกเลิกรายการประมูล"),
  );
  await assert.rejects(
    service.cancel({ user, auctionId: "item-1", reason: "   " }),
    (err) =>
      err.status === 400 &&
      err.message.includes("กรุณาระบุเหตุผลในการยกเลิกรายการประมูล"),
  );
  await assert.rejects(
    service.cancel({ user, auctionId: "item-1", reason: "ก".repeat(501) }),
    (err) => err.status === 400 && err.message.includes("500"),
  );
});

test("cancel rejects item in pending_approval (must use reject instead)", async (t) => {
  const user = { id: "mkt-1", role: "MARKETING" };
  t.mock.method(repository, "findById", async () => ({
    id: "item-pending",
    status: "pending_approval",
    productId: "prod-1",
    sellerId: "seller-1",
  }));

  await assert.rejects(
    service.cancel({ user, auctionId: "item-pending", reason: "ข้อมูลผิด" }),
    (err) => err.status === 400 && err.message.includes("ปฏิเสธสินค้า"),
  );
});

test("cancel rejects item when winningOrderId already exists", async (t) => {
  const user = { id: "mkt-1", role: "MARKETING" };
  t.mock.method(repository, "findById", async () => ({
    id: "item-won",
    status: "open",
    winningOrderId: "order-999",
    productId: "prod-1",
    sellerId: "seller-1",
  }));

  await assert.rejects(
    service.cancel({ user, auctionId: "item-won", reason: "ยกเลิก" }),
    (err) => err.status === 400 && err.message.includes("สร้างคำสั่งซื้อ"),
  );
});

test("cancel on open item with bids logs AUCTION_ITEM_CANCEL, cancels close job, and notifies seller and bidders", async (t) => {
  const user = { id: "mkt-1", role: "MARKETING" };
  const auditLogs = [];
  let cancelledJobId = null;
  let notifiedPayload = null;
  let updatedProductStatus = null;

  t.mock.method(auctionCloseQueue, "cancelClose", async (id) => {
    cancelledJobId = id;
  });

  const chatClient = require("./chatClient");
  t.mock.method(chatClient, "notifyItemCancelled", async (payload) => {
    notifiedPayload = payload;
    return { deliveredCount: 3, failedCount: 0, warnings: [] };
  });

  t.mock.method(repository, "findById", async () => ({
    id: "item-open-1",
    productId: "prod-open-1",
    sellerId: "seller-open-1",
    status: "open",
    winningOrderId: null,
    product: { id: "prod-open-1", title: "กล้องฟิล์มวินเทจ" },
    round: {
      id: "round-open-1",
      title: "รอบพิเศษ",
      cancelledAt: null,
      auctionEndsAt: new Date(Date.now() + 3600000),
    },
    bids: [
      { bidderId: "buyer-1", amount: 500 },
      { bidderId: "buyer-2", amount: 600 },
      { bidderId: "buyer-1", amount: 700 },
    ],
  }));

  t.mock.method(repository, "updateStatus", async (id, data) => ({
    id,
    productId: "prod-open-1",
    sellerId: "seller-open-1",
    product: { id: "prod-open-1", title: "กล้องฟิล์มวินเทจ" },
    ...data,
  }));

  t.mock.method(repository, "setProductStatus", async (_id, status) => {
    updatedProductStatus = status;
  });

  t.mock.method(repository, "transaction", async (fn) => {
    const tx = {
      marketingAuditLog: {
        create: async ({ data }) => {
          auditLogs.push(data);
          return { id: "audit-item-cancel", ...data };
        },
        createMany: async ({ data }) => {
          if (Array.isArray(data)) auditLogs.push(...data);
          else auditLogs.push(data);
          return { count: Array.isArray(data) ? data.length : 1 };
        },
        findUnique: async () => ({ id: "audit-item-cancel" }),
      },
    };
    return fn(tx);
  });

  const result = await service.cancel({
    user,
    auctionId: "item-open-1",
    reason: "ตรวจพบปัญหารายละเอียดสินค้า",
  });

  assert.equal(result.status, "cancelled");
  assert.equal(result.cancellationReason, "ตรวจพบปัญหารายละเอียดสินค้า");
  assert.equal(result.cancelledBy, "mkt-1");
  assert.equal(updatedProductStatus, "auction_action_required");
  assert.equal(cancelledJobId, "item-open-1");

  assert.equal(auditLogs.length, 1);
  assert.equal(auditLogs[0].action, "AUCTION_ITEM_CANCEL");
  assert.equal(auditLogs[0].entityId, "item-open-1");
  assert.equal(auditLogs[0].metadata.affectedBidderCount, 2);

  assert.ok(notifiedPayload);
  assert.equal(notifiedPayload.sellerId, "seller-open-1");
  assert.equal(notifiedPayload.wasOpen, true);
  assert.deepEqual(notifiedPayload.bidderIds.sort(), ["buyer-1", "buyer-2"]);
});

test("chatClient.notifyItemCancelled notifies only seller before open, and notifies seller + bidders with isolated 1-on-1 rooms and idempotency keys when open", async (t) => {
  const chatClient = require("./chatClient");
  const calls = [];
  t.mock.method(global, "fetch", async (url, opts) => {
    const body = JSON.parse(opts.body);
    calls.push({ url, body });
    if (url.endsWith("/internal/conversations")) {
      return {
        ok: true,
        status: 201,
        json: async () => ({ id: `conv-${body.contextId}` }),
      };
    }
    return {
      ok: true,
      status: 201,
      json: async () => ({ id: "msg-1", ...body }),
    };
  });

  // 1. Pre-open cancellation (scheduled): notifies ONLY seller, not bidders or non-bidders
  const preOpenRes = await chatClient.notifyItemCancelled({
    item: {
      id: "item-pre",
      productId: "prod-pre",
      sellerId: "seller-A",
      product: { title: "เสื้อแจ็คเก็ต" },
    },
    round: { id: "round-pre", title: "รอบต้นเดือน" },
    reason: "ผู้ขายแจ้งขอแก้ไข",
    wasOpen: false,
    bidderIds: ["buyer-X"],
  });

  assert.equal(preOpenRes.deliveredCount, 1);
  assert.equal(preOpenRes.failedCount, 0);
  // 2 fetch calls: 1 conversation + 1 message for seller-A only
  assert.equal(calls.length, 2);
  assert.equal(calls[0].body.contextType, "AUCTION");
  assert.equal(calls[0].body.contextId, "round-pre:seller-A");
  assert.deepEqual(calls[0].body.participants, [
    { userId: "seller-A", role: "SELLER" },
    { userId: "system-marketing", role: "SYSTEM" },
  ]);
  assert.equal(
    calls[1].body.idempotencyKey,
    "auction.item_cancelled:item-pre:seller-A",
  );

  // 2. Open cancellation: notifies seller + deduplicated bidders, each in their own isolated 1-on-1 room
  calls.length = 0;
  const openRes = await chatClient.notifyItemCancelled({
    item: {
      id: "item-open",
      productId: "prod-open",
      sellerId: "seller-B",
      product: { title: "นาฬิกาวินเทจ" },
    },
    round: { id: "round-open", title: "รอบกลางเดือน" },
    reason: "สินค้าชำรุดกะทันหัน",
    wasOpen: true,
    bidderIds: ["buyer-1", "buyer-2", "buyer-1"],
  });

  assert.equal(openRes.deliveredCount, 3);
  assert.equal(openRes.failedCount, 0);
  const convCalls = calls.filter((c) =>
    c.url.endsWith("/internal/conversations"),
  );
  const msgCalls = calls.filter((c) => c.url.includes("/messages"));
  assert.equal(convCalls.length, 3);
  assert.equal(msgCalls.length, 3);

  // Verify user isolation: each conversation has only 1 human recipient + system-marketing
  const contextIds = convCalls.map((c) => c.body.contextId).sort();
  assert.deepEqual(contextIds, [
    "round-open:buyer-1",
    "round-open:buyer-2",
    "round-open:seller-B",
  ]);
  for (const convCall of convCalls) {
    assert.equal(convCall.body.participants.length, 2);
  }
});

test("cancel still succeeds and returns warning when chat-service fails", async (t) => {
  const user = { id: "mkt-1", role: "MARKETING" };
  const chatClient = require("./chatClient");
  t.mock.method(chatClient, "notifyItemCancelled", async () => ({
    deliveredCount: 0,
    failedCount: 1,
    warnings: ["ไม่สามารถส่งข้อความแจ้งเตือนทางแชทได้ครบทุกฝ่าย (1 รายการ)"],
  }));

  t.mock.method(repository, "findById", async () => ({
    id: "item-warn-1",
    productId: "prod-warn-1",
    sellerId: "seller-1",
    status: "approved",
    product: { id: "prod-warn-1", title: "กระเป๋า" },
    round: {
      id: "round-1",
      title: "รอบ 1",
      cancelledAt: null,
      auctionEndsAt: new Date(Date.now() + 3600000),
    },
    bids: [],
  }));
  t.mock.method(repository, "updateStatus", async (id, data) => ({
    id,
    ...data,
  }));

  const result = await service.cancel({
    user,
    auctionId: "item-warn-1",
    reason: "ยกเลิกเนื่องจากข้อมูลคลาดเคลื่อน",
  });

  assert.equal(result.status, "cancelled");
  assert.equal(result.warnings.length, 1);
  assert.ok(result.warnings[0].includes("ไม่สามารถส่งข้อความแจ้งเตือน"));
});

test("cancel on already cancelled item performs idempotent notification retry without mutating state or creating duplicate audit logs", async (t) => {
  const user = { id: "mkt-1", role: "MARKETING" };
  let updateStatusCalls = 0;
  let setProductStatusCalls = 0;
  let auditCalls = 0;
  let notifyCalls = 0;

  const chatClient = require("./chatClient");
  t.mock.method(chatClient, "notifyItemCancelled", async (payload) => {
    notifyCalls++;
    assert.equal(payload.item.id, "item-already-cancelled");
    assert.equal(payload.reason, "เหตุผลเดิมของรายการ");
    assert.equal(payload.wasOpen, true);
    assert.deepEqual(payload.bidderIds, ["buyer-1"]);
    return { deliveredCount: 2, failedCount: 0, warnings: [] };
  });

  t.mock.method(repository, "findById", async () => ({
    id: "item-already-cancelled",
    productId: "prod-1",
    sellerId: "seller-1",
    status: "cancelled",
    cancellationReason: "เหตุผลเดิมของรายการ",
    cancelledAt: new Date("2026-04-10T10:00:00Z"),
    cancelledBy: "mkt-1",
    product: { id: "prod-1", title: "กล้องฟิล์ม" },
    round: {
      id: "round-1",
      title: "รอบ 1",
      cancelledAt: null,
      auctionEndsAt: new Date(Date.now() + 3600000),
    },
    bids: [{ bidderId: "buyer-1", amount: 500 }],
  }));

  t.mock.method(repository, "updateStatus", async () => {
    updateStatusCalls++;
  });
  t.mock.method(repository, "setProductStatus", async () => {
    setProductStatusCalls++;
  });
  t.mock.method(repository, "withAuctionLock", async (_id, fn) => {
    const tx = {
      marketingAuditLog: {
        create: async () => {
          auditCalls++;
        },
      },
    };
    return fn(tx);
  });

  const result = await service.cancel({
    user,
    auctionId: "item-already-cancelled",
    reason: "ลองส่งแจ้งเตือนซ้ำ",
  });

  assert.equal(result.status, "cancelled");
  assert.equal(result.cancellationReason, "เหตุผลเดิมของรายการ");
  assert.equal(updateStatusCalls, 0);
  assert.equal(setProductStatusCalls, 0);
  assert.equal(auditCalls, 0);
  assert.equal(notifyCalls, 1);
  assert.deepEqual(result.warnings, []);
});

test("submit re-reads round inside withRoundMutationLock and rejects without creating Product or AuctionItem if round was cancelled concurrently", async (t) => {
  const seller = { id: "seller-1", role: "SELLER", kycVerified: true };
  const lockCalls = [];
  let createdItems = 0;
  let createdProducts = 0;

  // Initial pre-lock read sees round as not cancelled yet
  t.mock.method(repository, "findRoundForSubmission", async () => ({
    id: "round-race-1",
    categories: ["แฟชั่น"],
    submissionStartsAt: new Date(Date.now() - 3600000),
    submissionEndsAt: new Date(Date.now() + 3600000),
    auctionStartsAt: new Date(Date.now() + 7200000),
    auctionEndsAt: new Date(Date.now() + 14400000),
    cancelledAt: null,
  }));

  t.mock.method(repository, "findCategory", async () => ({ name: "แฟชั่น" }));
  t.mock.method(productModel, "listConditions", async () => [
    { value: "ดีมาก" },
  ]);
  t.mock.method(repository, "findProductOwner", async () => ({
    id: "prod-existing-1",
    sellerId: "seller-1",
    status: "available",
    category: "แฟชั่น",
  }));
  t.mock.method(repository, "findActiveAuctionByProductId", async () => null);
  t.mock.method(productModel, "create", async () => {
    createdProducts++;
    return { id: "prod-new-orphan" };
  });
  t.mock.method(repository, "create", async () => {
    createdItems++;
    return { id: "item-orphan" };
  });

  // Inside the round mutation lock, the round has just been cancelled by cancelRound
  t.mock.method(
    repository,
    "withRoundMutationLock",
    async (roundId, fn, opts = {}) => {
      lockCalls.push({ roundId, productId: opts.productId || null });
      const tx = {
        auctionRound: {
          findUnique: async () => ({
            id: roundId,
            categories: ["แฟชั่น"],
            submissionStartsAt: new Date(Date.now() - 3600000),
            submissionEndsAt: new Date(Date.now() + 3600000),
            auctionStartsAt: new Date(Date.now() + 7200000),
            auctionEndsAt: new Date(Date.now() + 14400000),
            cancelledAt: new Date(),
          }),
        },
      };
      return fn(tx);
    },
  );

  // Flow A: Existing Product submission
  await assert.rejects(
    service.submit({
      user: seller,
      input: {
        roundId: "round-race-1",
        productId: "prod-existing-1",
        startingPrice: 200,
        bidIncrement: 20,
      },
    }),
    (err) => err.status === 400 && err.message.includes("ถูกยกเลิกแล้ว"),
  );

  // Flow B: New Product + AuctionItem submission
  await assert.rejects(
    service.submit({
      user: seller,
      input: {
        roundId: "round-race-1",
        title: "เสื้อเชิ้ตใหม่",
        description: "รายละเอียดเสื้อเชิ้ตใหม่สำหรับประมูล",
        category: "แฟชั่น",
        condition: "ดีมาก",
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
    (err) => err.status === 400 && err.message.includes("ถูกยกเลิกแล้ว"),
  );

  assert.equal(lockCalls.length, 2);
  assert.deepEqual(lockCalls[0], {
    roundId: "round-race-1",
    productId: "prod-existing-1",
  });
  assert.deepEqual(lockCalls[1], {
    roundId: "round-race-1",
    productId: null,
  });
  assert.equal(createdProducts, 0);
  assert.equal(createdItems, 0);
});

test("browseRounds includes cancelled upcoming round until auctionEndsAt and hides it after auctionEndsAt", async (t) => {
  let upcomingOpts = null;
  const now = Date.now();

  const cancelledUpcomingStillValid = {
    id: "round-up-cancelled-valid",
    title: "รอบกำลังจะมาถึงแต่ยกเลิก",
    categories: ["แฟชั่น"],
    submissionStartsAt: new Date(now - 7200000),
    submissionEndsAt: new Date(now - 3600000),
    auctionStartsAt: new Date(now + 3600000),
    auctionEndsAt: new Date(now + 7200000),
    cancelledAt: new Date(now - 60000),
    cancellationReason: "ปรับตารางรอบประมูลใหม่",
    _count: { auctions: 2 },
  };

  const cancelledUpcomingExpired = {
    id: "round-up-cancelled-expired",
    title: "รอบที่หมดเวลาแล้ว",
    categories: ["แฟชั่น"],
    submissionStartsAt: new Date(now - 14400000),
    submissionEndsAt: new Date(now - 10800000),
    auctionStartsAt: new Date(now - 7200000),
    auctionEndsAt: new Date(now - 1000),
    cancelledAt: new Date(now - 9000000),
    cancellationReason: "ยกเลิกรอบเก่า",
    _count: { auctions: 1 },
  };

  t.mock.method(repository, "findActiveAuctionRounds", async () => []);
  t.mock.method(repository, "findUpcomingRounds", async (_nowArg, opts) => {
    upcomingOpts = opts;
    return [cancelledUpcomingStillValid, cancelledUpcomingExpired];
  });

  const res = await service.browseRounds();

  assert.deepEqual(upcomingOpts, { includeCancelled: true });
  assert.equal(res.upcomingRounds.length, 1);
  assert.equal(res.upcomingRounds[0].id, "round-up-cancelled-valid");
  assert.equal(res.upcomingRounds[0].phase, "cancelled");
  assert.equal(
    res.upcomingRounds[0].cancellationReason,
    "ปรับตารางรอบประมูลใหม่",
  );
});

test("chatClient.notifyRoundCancelled partial failure followed by retry delivers missing recipient and deduplicates already-delivered recipients", async (t) => {
  const chatClient = require("./chatClient");
  const deliveredByKey = new Map();
  let failBidder2Once = true;

  t.mock.method(global, "fetch", async (url, opts) => {
    const body = JSON.parse(opts.body);
    if (url.endsWith("/internal/conversations")) {
      return {
        ok: true,
        status: 201,
        json: async () => ({ id: `conv-${body.contextId}` }),
      };
    }
    const key = body.idempotencyKey;
    if (key.endsWith(":buyer-2") && failBidder2Once) {
      failBidder2Once = false;
      return {
        ok: false,
        status: 503,
        text: async () => "Service Unavailable",
      };
    }
    if (deliveredByKey.has(key)) {
      return {
        ok: true,
        status: 200,
        json: async () => deliveredByKey.get(key),
      };
    }
    const created = { id: `msg-${deliveredByKey.size + 1}`, ...body };
    deliveredByKey.set(key, created);
    return {
      ok: true,
      status: 201,
      json: async () => created,
    };
  });

  const round = {
    id: "round-retry-1",
    title: "รอบทดสอบ Retry",
    cancellationReason: "ระบบขัดข้องชั่วคราว",
  };

  // First attempt: seller-1 and buyer-1 succeed, buyer-2 fails
  const firstRes = await chatClient.notifyRoundCancelled({
    round,
    sellerIds: ["seller-1"],
    bidderIds: ["buyer-1", "buyer-2"],
  });
  assert.equal(firstRes.deliveredCount, 2);
  assert.equal(firstRes.failedCount, 1);
  assert.equal(firstRes.warnings.length, 1);
  assert.equal(deliveredByKey.size, 2);

  // Second attempt (retry): all 3 succeed, only buyer-2 is newly created, total messages in DB = 3
  const secondRes = await chatClient.notifyRoundCancelled({
    round,
    sellerIds: ["seller-1"],
    bidderIds: ["buyer-1", "buyer-2"],
  });
  assert.equal(secondRes.deliveredCount, 3);
  assert.equal(secondRes.failedCount, 0);
  assert.equal(secondRes.warnings.length, 0);
  assert.equal(
    deliveredByKey.size,
    3,
    "Retry must deliver missing buyer-2 without duplicating seller-1 or buyer-1",
  );
});
