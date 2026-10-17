const { test } = require("node:test");
const assert = require("node:assert/strict");
const { requireRoundCapacity, assertRoundHasCapacity, addRoundCapacityCounts } = require("./roundCapacity");
const { createAuctionRepository } = require("./auctionRepository");

test("new round capacity requires a positive database integer without coercion", () => {
  for (const value of [undefined, null, "20", true, 0, -1, 1.5, NaN, Infinity, 2147483648]) {
    assert.throws(() => requireRoundCapacity(value), error => error.status === 400);
  }
  assert.equal(requireRoundCapacity(20), 20);
});

test("legacy rounds are unlimited; pending items reserve slots until rejected or cancelled", async () => {
  await assertRoundHasCapacity({ id: "legacy", maxItems: null }, {});
  let query;
  const tx = { auctionItem: { count: async options => { query = options; return 2; } } };
  await assert.rejects(assertRoundHasCapacity({ id: "round", maxItems: 2 }, tx), error => error.status === 409);
  assert.deepEqual(query.where, { roundId: "round", status: { notIn: ["rejected", "cancelled"] } });
  await assertRoundHasCapacity({ id: "round", maxItems: 3 }, tx);
});

test("capacity display batches counts and does not change existing total item counts", async () => {
  let calls = 0;
  const client = { auctionItem: { groupBy: async query => {
    calls++;
    assert.deepEqual(query.where.roundId.in, ["limited", "empty"]);
    return [{ roundId: "limited", _count: { _all: 2 } }];
  } } };
  const rounds = await addRoundCapacityCounts([
    { id: "limited", maxItems: 2, _count: { auctions: 4 } },
    { id: "empty", maxItems: 10 }, { id: "legacy", maxItems: null },
  ], client);
  assert.equal(calls, 1);
  assert.equal(rounds[0].submittedItemCount, 2);
  assert.equal(rounds[0]._count.auctions, 4);
  assert.equal(rounds[1].submittedItemCount, 0);
  assert.equal(rounds[2].maxItems, null);
});

test("stale approval or rejection cannot resurrect a released slot", async () => {
  const tx = { auctionItem: { updateMany: async () => ({ count: 0 }) } };
  const repository = createAuctionRepository(tx);
  await assert.rejects(repository.updateStatus("item", { status: "scheduled" }, tx,
    { expectedStatus: "pending_approval", strictStatus: true }), error => error.status === 409);
});
