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
});

test("approve rejects a non-Admin caller", async () => {
  await assert.rejects(
    service.approve({ user: { id: "u1", role: "MARKETING" }, auctionId: "a1" }),
    (err) => err.status === 403,
  );
});

test("approve rejects moving out of a non-pending_approval state", async (t) => {
  t.mock.method(repository, "findById", async () => ({
    id: "a1",
    status: "draft",
  }));

  await assert.rejects(
    service.approve({ user: { id: "admin-1", role: "ADMIN" }, auctionId: "a1" }),
    (err) => err.status === 409,
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
