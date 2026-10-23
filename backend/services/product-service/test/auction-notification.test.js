const test = require("node:test");
const assert = require("node:assert/strict");
const chatClient = require("../src/features/auctions/chatClient");

function captureRequests(t) {
  const requests = [];
  t.mock.method(global, "fetch", async (url, options) => {
    const body = JSON.parse(options.body);
    requests.push({ url, body });
    return {
      ok: true,
      json: async () =>
        url.endsWith("/internal/conversations")
          ? { id: "auction-notification-room" }
          : { id: "notification-message" },
    };
  });
  return requests;
}

test("rejection notifies only the seller with reason, safe item link and stable key", async (t) => {
  const requests = captureRequests(t);
  const input = {
    item: {
      id: "item-rejected-1",
      roundId: "round-1",
      productId: "product-1",
      sellerId: "seller-1",
      product: { title: "เสื้อแจ็กเก็ต" },
    },
    round: { id: "round-1", title: "รอบฤดูหนาว" },
    reason: "รูปภาพไม่ชัดเจน",
  };

  await chatClient.notifyItemRejected(input);
  await chatClient.notifyItemRejected(input);

  const messages = requests.filter(({ url }) => url.endsWith("/messages"));
  assert.equal(messages.length, 2);
  assert.match(messages[0].body.body, /รูปภาพไม่ชัดเจน/);
  assert.equal(messages[0].body.payload.actionUrl, "/auctions/item-rejected-1");
  assert.equal(
    messages[0].body.idempotencyKey,
    "auction.item_rejected:item-rejected-1:seller-1",
  );
  assert.equal(messages[0].body.idempotencyKey, messages[1].body.idempotencyKey);

  const bellNotifs = requests.filter(({ url }) => url.endsWith("/internal/notifications"));
  assert.equal(bellNotifs.length, 2);
  assert.equal(bellNotifs[0].body.userId, "seller-1");
  assert.equal(bellNotifs[0].body.type, "AUCTION");
  assert.equal(bellNotifs[0].body.link, "/seller/auctions");
});

test("item, round cancellation and round update include in-chat detail links", async (t) => {
  const requests = captureRequests(t);
  await chatClient.notifyItemCancelled({
    item: {
      id: "item-cancelled-1",
      roundId: "round-2",
      productId: "product-2",
      sellerId: "seller-2",
      product: { title: "กระเป๋า" },
    },
    round: { id: "round-2", title: "รอบกระเป๋า" },
    reason: "สินค้าไม่พร้อม",
  });
  await chatClient.notifyRoundCancelled({
    round: {
      id: "round-3",
      title: "รอบวันศุกร์",
      cancellationReason: "ปิดปรับปรุงระบบ",
    },
    sellerIds: ["seller-3"],
    bidderIds: ["buyer-3"],
  });
  await chatClient.notifyRoundUpdated({
    round: {
      id: "round-4",
      title: "รอบเลื่อนเวลา",
      auctionEndsAt: "2026-10-15T12:00:00.000Z",
    },
    eventId: "round-update-event-1",
    metadata: {
      changedFields: ["auctionEndsAt"],
      previousTimes: { auctionEndsAt: "2026-10-15T11:00:00.000Z" },
      sellerIds: ["seller-4"],
      affectedItems: [
        {
          title: "รองเท้า",
          closesAt: "2026-10-15T12:00:00.000Z",
          sellerId: "seller-4",
          bidderIds: ["buyer-4"],
        },
      ],
    },
  });

  const payloads = requests
    .filter(({ url }) => url.endsWith("/messages"))
    .map(({ body }) => body.payload);
  assert.ok(
    payloads.some(
      (payload) => payload.actionUrl === "/auctions/item-cancelled-1",
    ),
  );
  assert.equal(
    payloads.filter(
      (payload) => payload.actionUrl === "/auctions/rounds/round-3",
    ).length,
    2,
  );
  assert.equal(
    payloads.filter(
      (payload) => payload.actionUrl === "/auctions/rounds/round-4",
    ).length,
    2,
  );
  assert.ok(
    payloads
      .filter((payload) => payload.event === "auction.round_cancelled")
      .every(
        (payload) => payload.summary === 'รอบประมูล "รอบวันศุกร์" ถูกยกเลิก',
      ),
  );
  assert.ok(
    payloads
      .filter((payload) => payload.event === "auction.round_updated")
      .every(
        (payload) =>
          payload.summary === 'เวลารอบประมูล "รอบเลื่อนเวลา" มีการเปลี่ยนแปลง',
      ),
  );
  assert.ok(payloads.every((payload) => payload.summary));

  const bellNotifs = requests.filter(({ url }) => url.endsWith("/internal/notifications"));
  const itemCancelledBell = bellNotifs.find((r) => r.body.userId === "seller-2");
  assert.ok(itemCancelledBell);
  assert.equal(itemCancelledBell.body.link, "/seller/auctions");
  assert.equal(itemCancelledBell.body.type, "AUCTION");

  const sellerRoundCancelledBell = bellNotifs.find((r) => r.body.userId === "seller-3");
  assert.ok(sellerRoundCancelledBell);
  assert.equal(sellerRoundCancelledBell.body.link, "/seller/auctions");

  const buyerRoundCancelledBell = bellNotifs.find((r) => r.body.userId === "buyer-3");
  assert.ok(buyerRoundCancelledBell);
  assert.equal(buyerRoundCancelledBell.body.link, "/auctions/rounds/round-3");
});

test("auction cancellation notification delivers to notification center even if chat fails", async (t) => {
  const requests = [];
  t.mock.method(global, "fetch", async (url, options) => {
    const body = JSON.parse(options.body);
    requests.push({ url, body });
    if (url.endsWith("/internal/conversations")) {
      throw new Error("Chat service unavailable");
    }
    return {
      ok: true,
      json: async () => ({ id: "notif-success" }),
    };
  });

  await chatClient.notifyItemCancelled({
    item: {
      id: "item-cancelled-failover",
      roundId: "round-99",
      productId: "product-99",
      sellerId: "seller-99",
      product: { title: "กล้องถ่ายรูป" },
    },
    round: { id: "round-99", title: "รอบอุปกรณ์" },
    reason: "ผู้ดูแลยกเลิกรายการ",
  });

  const bellNotifs = requests.filter(({ url }) => url.endsWith("/internal/notifications"));
  assert.equal(bellNotifs.length, 1);
  assert.equal(bellNotifs[0].body.userId, "seller-99");
  assert.equal(bellNotifs[0].body.link, "/seller/auctions");
  assert.equal(bellNotifs[0].body.type, "AUCTION");
});
