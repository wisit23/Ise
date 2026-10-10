const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const repository = require("./auctionRepository");
const orderClient = require("./orderClient");
const auctionCloseQueue = require("../../jobs/auctionCloseQueue");
const service = require("./auctionService");

// Unit tests never talk to real Redis — every test that exercises schedule()
// stubs the queue calls it makes.
beforeEach((t) => {
  t.mock.method(auctionCloseQueue, "scheduleClose", async () => {});
  t.mock.method(auctionCloseQueue, "cancelClose", async () => {});
  t.mock.method(repository, "setProductStatus", async () => {});
  t.mock.method(repository, "findActiveSubmissionRound", async () => ({
    id: "round-1",
    title: "Round 1",
    submissionStartsAt: new Date(Date.now() - 3600000),
    submissionEndsAt: new Date(Date.now() + 3600000),
    auctionStartsAt: new Date(Date.now() + 7200000),
    auctionEndsAt: new Date(Date.now() + 14400000),
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
      input: { productId: "p1", startingPrice: 0, bidIncrement: 10 },
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
      input: { productId: "p1", startingPrice: 100, bidIncrement: 10 },
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
      input: { productId: "p1", startingPrice: 100, bidIncrement: 10 },
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
    input: { productId: "p1", startingPrice: 100, bidIncrement: 10 },
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
    (err) => err.status === 400 && err.message === "bid must be at least 160",
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
    (err) =>
      err.status === 409 && err.message.includes("idempotency key reused"),
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
    (err) =>
      err.status === 409 && err.message.includes("idempotency key reused"),
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
    (err) =>
      err.status === 409 && err.message.includes("idempotency key reused"),
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
    (err) =>
      err.status === 409 && err.message.includes("idempotency key reused"),
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
    input: { productId: "p1", startingPrice: 100, bidIncrement: 10 },
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
    input: { productId: "p1", startingPrice: 100, bidIncrement: 10 },
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

test("cancel resets product status back to 'available'", async (t) => {
  let revertedStatus = null;
  t.mock.method(repository, "findById", async () => ({
    id: "a1",
    productId: "p1",
    status: "scheduled",
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
  });

  assert.equal(result.status, "cancelled");
  assert.equal(revertedStatus, "available");
});

test("closing an auction with no bids resets product status back to 'available'", async (t) => {
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

  assert.equal(revertedStatus, "available");
});

test("submit rejects when no active auction round is accepting submissions", async (t) => {
  t.mock.method(repository, "findProductOwner", async () => ({
    id: "p1",
    sellerId: "seller-1",
    status: "available",
  }));
  t.mock.method(repository, "findActiveSubmissionRound", async () => null);

  await assert.rejects(
    service.submit({
      user: { id: "seller-1", role: "SELLER" },
      input: { productId: "p1", startingPrice: 100, bidIncrement: 10 },
    }),
    (err) =>
      err.status === 400 &&
      err.message.includes("ขณะนี้ไม่มีรอบเปิดรับสินค้าเข้าประมูล"),
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
  t.mock.method(repository, "withRoundLock", async (fn) => fn("mock-tx"));
  t.mock.method(repository, "findConflictingRound", async () => null);
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
  t.mock.method(repository, "findCurrentRound", async () => ({
    id: "round-1",
    title: "Round 1",
    submissionStartsAt: new Date("2026-09-01T00:00:00Z"),
    submissionEndsAt: new Date("2026-09-05T00:00:00Z"),
    auctionStartsAt: new Date("2026-09-06T00:00:00Z"),
    auctionEndsAt: new Date("2026-09-08T00:00:00Z"),
  }));

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
    (err) => err.status === 400 && err.message.includes("title is required"),
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
    (err) => err.status === 400 && err.message.includes("valid dates"),
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
      err.message.includes("submissionEndsAt must be after submissionStartsAt"),
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
        "auctionStartsAt must be after or equal to submissionEndsAt",
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
      err.message.includes("auctionEndsAt must be after auctionStartsAt"),
  );
});

test("createRound throws 409 Conflict when overlapping round exists", async (t) => {
  const user = { id: "mkt-1", role: "MARKETING" };
  const existingRound = {
    id: "round-exist-1",
    title: "Existing Round 1",
    submissionStartsAt: new Date("2026-10-01T00:00:00.000Z"),
    auctionEndsAt: new Date("2026-10-05T00:00:00.000Z"),
  };

  t.mock.method(repository, "withRoundLock", async (fn) => fn("mock-tx"));
  t.mock.method(repository, "findConflictingRound", async (range, tx) => {
    assert.ok(range.subStart);
    assert.ok(range.aucEnd);
    assert.equal(tx, "mock-tx", "must query conflict using transaction client");
    return existingRound;
  });

  await assert.rejects(
    service.createRound({
      user,
      input: {
        title: "Overlapping Round",
        submissionStartsAt: "2026-10-04T00:00:00.000Z",
        submissionEndsAt: "2026-10-06T00:00:00.000Z",
        auctionStartsAt: "2026-10-06T00:00:00.000Z",
        auctionEndsAt: "2026-10-08T00:00:00.000Z",
      },
    }),
    (err) => {
      assert.equal(err.status, 409);
      assert.ok(err.message.includes("Existing Round 1"));
      assert.ok(
        err.message.includes("Round interval overlaps with existing round"),
      );
      return true;
    },
  );
});

test("createRound succeeds and passes tx when no conflict exists", async (t) => {
  const user = { id: "mkt-1", role: "MARKETING" };
  let createdWithTx = null;

  t.mock.method(repository, "withRoundLock", async (fn) => fn("mock-tx"));
  t.mock.method(repository, "findConflictingRound", async (params, tx) => {
    assert.equal(tx, "mock-tx");
    return null;
  });
  t.mock.method(repository, "createRound", async (data, tx) => {
    assert.equal(tx, "mock-tx");
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
  assert.equal(createdWithTx, "mock-tx");
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

  t.mock.method(repository, "findCurrentRound", async (now) => {
    assert.equal(now.getTime(), fakeNow.getTime());
    return activeRound;
  });

  const result = await service.getCurrentRound(fakeNow);
  assert.equal(result.round.id, "round-active");
  assert.equal(result.phase, "submission");
  assert.equal(result.isSubmissionOpen, true);
  assert.equal(result.isAuctionActive, false);
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

  t.mock.method(repository, "findCurrentRound", async (now) => {
    assert.equal(now.getTime(), fakeNow.getTime());
    return upcomingRound;
  });

  const result = await service.getCurrentRound(fakeNow);
  assert.equal(result.round.id, "round-upcoming");
  assert.equal(result.phase, "upcoming");
  assert.equal(result.isSubmissionOpen, false);
  assert.equal(result.isAuctionActive, false);
});

test("getCurrentRound returns null when all rounds ended or none exist", async (t) => {
  const fakeNow = new Date("2026-12-01T00:00:00.000Z");

  t.mock.method(repository, "findCurrentRound", async () => null);

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
