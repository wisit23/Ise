const test = require("node:test");
const assert = require("node:assert/strict");
const calls = {};
const prisma = {
  product: {
    findMany: async (query) => { calls.products = query; return calls.rows; },
    count: async () => calls.rows.length,
  },
  bid: {
    findMany: async (query) => {
      calls.winners = query;
      return [{ id: "second-bid", amount: 400 }];
    },
  },
};
const prismaPath = require.resolve("./prismaClient");
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prisma };
const productModel = require("./productModel");

test("seller products include the leading bid and the assigned winning bid", async () => {
  const products = [
    { id: "open-product", sellerId: "seller", status: "auction", price: 69,
      auctions: [{ id: "open-auction", status: "open", startingPrice: 69,
        winningBidId: null, bids: [{ amount: 275 }] }] },
    { id: "sold-product", sellerId: "seller", status: "sold", price: 69,
      auctions: [{ id: "closed-auction", status: "closed", startingPrice: 69,
        winningBidId: "second-bid", bids: [{ amount: 500 }] }] },
    { id: "regular-product", sellerId: "seller", status: "available", price: 100,
      auctions: [] },
  ];
  calls.rows = products;

  const result = await productModel.listBySeller("seller", { take: 100 });
  assert.equal(calls.products.include.auctions.select.bids.take, 1);
  assert.deepEqual(calls.winners.where.id.in, ["second-bid"]);
  assert.equal(result.items[0].auctionCurrentBid, 275);
  assert.equal(result.items[0].auctionStartingPrice, 69);
  assert.equal(result.items[1].auctionCurrentBid, 500);
  assert.equal(result.items[1].auctionWinningPrice, 400);
  assert.equal(result.items[2].auctionCurrentBid, undefined);
});
