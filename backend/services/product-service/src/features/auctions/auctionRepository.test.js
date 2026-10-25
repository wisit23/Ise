const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createAuctionRepository } = require("./auctionRepository");

test("findRoundWithItems excludes cancelled items from the public round query", async () => {
  let receivedQuery;
  const repository = createAuctionRepository({
    auctionRound: {
      findUnique: async (query) => {
        receivedQuery = query;
        return null;
      },
    },
  });

  await repository.findRoundWithItems("round-1");

  assert.deepEqual(receivedQuery.where, { id: "round-1" });
  assert.deepEqual(receivedQuery.include.auctions.where.status.in, [
    "open",
    "scheduled",
  ]);
});

test("list applies multiple round/status values and search before pagination", async () => {
  const calls = [];
  const repository = createAuctionRepository({
    auctionItem: {
      findMany: async (query) => {
        calls.push(["findMany", query]);
        return [];
      },
      count: async (query) => {
        calls.push(["count", query]);
        return 0;
      },
    },
  });

  await repository.list({
    statuses: ["pending_approval", "approved", "cancelled"],
    roundIds: ["round-1", "round-2"],
    search: "ร้านวินเทจ",
    sellerIds: ["seller-1"],
    skip: 20,
    take: 20,
  });

  const expectedWhere = {
    product: { deletedAt: null },
    status: { in: ["pending_approval", "approved", "cancelled"] },
    roundId: { in: ["round-1", "round-2"] },
    OR: [
      {
        product: {
          title: { contains: "ร้านวินเทจ", mode: "insensitive" },
        },
      },
      { sellerId: { in: ["seller-1"] } },
    ],
  };
  assert.deepEqual(calls[0][1].where, expectedWhere);
  assert.equal(calls[0][1].skip, 20);
  assert.equal(calls[0][1].take, 20);
  assert.deepEqual(calls[1][1].where, expectedWhere);
});

test("findActiveAuctionRounds includes an open soft-close item after the base round end", async () => {
  let receivedQuery;
  const repository = createAuctionRepository({
    auctionRound: {
      findMany: async (query) => {
        receivedQuery = query;
        return [];
      },
    },
  });
  const now = new Date("2026-10-02T12:05:00.000Z");

  await repository.findActiveAuctionRounds(now);

  assert.deepEqual(receivedQuery.where.OR[1], {
    auctions: {
      some: { status: "open", scheduledEndAt: { gt: now } },
    },
  });
});
