const test = require("node:test");
const assert = require("node:assert/strict");
const chatClient = require("./chatClient");

function mockChat(t) {
  const calls = [];
  t.mock.method(global, "fetch", async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ url: String(url), body });
    if (String(url).endsWith("/internal/conversations")) {
      return { ok: true, json: async () => ({ id: `conversation-${body.contextId}` }) };
    }
    return { ok: true, json: async () => ({ id: body.idempotencyKey }) };
  });
  return calls;
}

test("promoted winner notification tells the old winner, new winner, and seller with safe action links", async (t) => {
  const calls = mockChat(t);

  const result = await chatClient.notifyAuctionWinnerAssigned({
    auction: {
      id: "auction-1",
      roundId: "round-1",
      productId: "product-1",
      productTitle: "กระเป๋าวินเทจ",
      sellerId: "seller-1",
    },
    order: {
      id: "order-b",
      buyerId: "buyer-b",
      auctionBidId: "bid-b-900",
      price: 900,
      paymentDeadlineAt: "2026-10-18T12:00:00.000Z",
    },
    winnerName: "ผู้ซื้อ B",
    previousWinnerId: "buyer-a",
    previousBidId: "bid-a-1000",
    previousOrderId: "order-a",
  });

  assert.equal(result.deliveredCount, 3);
  const messages = calls
    .filter((call) => call.url.includes("/messages"))
    .map((call) => call.body);
  assert.equal(messages.length, 3);

  const expired = messages.find(
    (message) => message.payload.event === "auction.payment_expired",
  );
  assert.match(expired.body, /ไม่ได้ชำระเงินภายใน 24 ชั่วโมง/);
  assert.equal(expired.payload.actionUrl, "/orders");

  const winner = messages.find(
    (message) => message.payload.event === "auction.winner_promoted",
  );
  assert.match(winner.body, /ผู้ชนะลำดับก่อนหน้าไม่ได้ชำระเงิน/);
  assert.match(winner.body, /฿900/);
  assert.equal(winner.payload.actionUrl, "/checkout?orders=order-b");

  const seller = messages.find(
    (message) => message.payload.event === "auction.seller_winner_changed",
  );
  assert.match(seller.body, /ผู้ซื้อ B/);
  assert.match(seller.body, /฿900/);
  assert.equal(seller.payload.actionUrl, "/auctions/auction-1");
  assert.equal(new Set(messages.map((message) => message.idempotencyKey)).size, 3);
});

test("exhausted auction notification sends seller to recovery and removes payment action from the expired winner", async (t) => {
  const calls = mockChat(t);

  const result = await chatClient.notifyAuctionExhausted({
    auction: {
      id: "auction-1",
      roundId: "round-1",
      productId: "product-1",
      productTitle: "กระเป๋าวินเทจ",
      sellerId: "seller-1",
    },
    expiredBuyerId: "buyer-c",
    expiredBidId: "bid-c-500",
    expiredOrderId: "order-c",
  });

  assert.equal(result.deliveredCount, 2);
  const messages = calls
    .filter((call) => call.url.includes("/messages"))
    .map((call) => call.body);
  const seller = messages.find(
    (message) => message.payload.event === "auction.action_required",
  );
  assert.match(seller.body, /ส่งเข้าประมูลรอบใหม่/);
  assert.match(seller.body, /ขายแบบปกติ/);
  assert.equal(seller.payload.actionUrl, "/seller/auctions");

  const expired = messages.find(
    (message) => message.payload.event === "auction.payment_expired",
  );
  assert.equal(expired.payload.actionUrl, "/orders");
  assert.notEqual(expired.payload.actionLabel, "ไปชำระเงิน");
});
