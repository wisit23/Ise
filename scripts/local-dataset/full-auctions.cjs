const assert = require("node:assert/strict");
module.exports = async (ctx, finish = false) => {
  const { step, request, token, state, listing, label, coverage } = ctx;
  if (finish) {
    const auction = state["full-auction-winner"];
    let current = await request("/api/products/auctions/" + auction.id, null);
    while (current.status !== "closed") {
      const remaining = new Date(current.scheduledEndAt).getTime() - Date.now();
      if (remaining > 15 * 60000)
        throw new Error(
          "Auction close moved beyond demo window; inspect anti-sniping before continuing",
        );
      console.log(
        "Waiting for real auction close: " +
          Math.max(0, Math.ceil(remaining / 1000)) +
          " seconds",
      );
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(30000, Math.max(1000, remaining + 500))),
      );
      current = await request("/api/products/auctions/" + auction.id, null);
    }
    assert.ok(current.winningOrderId);
    await step("full-auction-winning-order", async () => {
      const order = await request(
        "/api/orders/" + current.winningOrderId,
        token("buyer"),
      );
      assert.equal(order.buyerId, ctx.accounts.buyer.user.id);
      assert.equal(Number(order.price || order.ordersAmount), 550);
      return { orderId: order.id, auctionId: auction.id };
    });
    coverage("product.auctions", [
      "submission",
      "Marketing approval/rejection/cancellation",
      "active auction",
      "two real bids and idempotent retry",
      "real-clock close and winning Order",
      "closed auction without bids",
    ]);
    return;
  }
  const activeRound = await step("full-auction-active-round", () =>
    request("/api/products/auctions/rounds", token("marketing"), {
      title: "DEMO รอบเปิดให้ทดลอง bid ต่อ",
      categories: ["เสื้อผ้า"],
      submissionStartsAt: new Date().toISOString(),
      submissionEndsAt: new Date(Date.now() + 10000).toISOString(),
      auctionStartsAt: new Date(Date.now() + 15000).toISOString(),
      auctionEndsAt: new Date(Date.now() + 2 * 86400000).toISOString(),
    }),
  );
  const activeProduct = await listing("auction-open");
  const open = await step("full-auction-open", () =>
    request("/api/products/auctions", token("seller"), {
      productId: activeProduct.id,
      roundId: activeRound.id,
      startingPrice: 450,
      bidIncrement: 50,
    }),
  );
  await step("full-auction-open-approve", () =>
    request(
      "/api/products/auctions/" + open.id + "/approve",
      token("marketing"),
      {},
      "PATCH",
    ),
  );
  const round = await step("full-auction-live-round", () =>
    request("/api/products/auctions/rounds", token("marketing"), {
      title: "DEMO รอบทดสอบ bid และปิดประมูลตามเวลาจริง",
      categories: ["เสื้อผ้า"],
      submissionStartsAt: new Date().toISOString(),
      submissionEndsAt: new Date(Date.now() + 25000).toISOString(),
      auctionStartsAt: new Date(Date.now() + 30000).toISOString(),
      auctionEndsAt: new Date(Date.now() + 390000).toISOString(),
    }),
  );
  for (const key of ["winner", "no-bids", "active", "rejected", "cancelled"]) {
    // Resume uses stored submissions; never backdate a new submission after the window.
    const product = await listing("auction-" + key);
    const auction = await step("full-auction-" + key, () =>
      request("/api/products/auctions", token("seller"), {
        productId: product.id,
        roundId: key === "active" ? state["auction-round"].id : round.id,
        startingPrice: 450,
        bidIncrement: 50,
      }),
    );
    const action = key === "rejected" ? "reject" : "approve";
    await step("full-auction-" + key + "-" + action, () =>
      request(
        "/api/products/auctions/" + auction.id + "/" + action,
        token("marketing"),
        {},
        "PATCH",
      ),
    );
    if (key === "cancelled")
      await step("full-auction-cancel-action", () =>
        request(
          "/api/products/auctions/" + auction.id + "/cancel",
          token("marketing"),
          { reason: "DEMO ผู้ขายแจ้งข้อมูลสินค้าไม่พร้อมก่อนเปิดประมูล" },
          "PATCH",
        ),
      );
  }
  if (!state["full-auction-second-bid"]) {
    const wait = new Date(round.auctionStartsAt).getTime() - Date.now() + 500;
    if (wait > 0)
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(wait, 35000)),
      );
    const auction = state["full-auction-winner"];
    await request("/api/products/auctions/" + auction.id, null);
    await step("full-auction-first-bid", () =>
      request(
        "/api/products/auctions/" + auction.id + "/bids",
        token("otherSeller"),
        { amount: 500, idempotencyKey: label + "-bid-one" },
      ),
    );
    await step("full-auction-second-bid", () =>
      request(
        "/api/products/auctions/" + auction.id + "/bids",
        token("buyer"),
        { amount: 550, idempotencyKey: label + "-bid-two" },
      ),
    );
    await step("full-auction-bid-retry", () =>
      request(
        "/api/products/auctions/" + auction.id + "/bids",
        token("buyer"),
        { amount: 550, idempotencyKey: label + "-bid-two" },
      ),
    );
  }
  const activeWait =
    new Date(activeRound.auctionStartsAt).getTime() - Date.now() + 500;
  if (!state["full-auction-open-bid"] && activeWait > 0)
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(20000, activeWait)),
    );
  await step("full-auction-open-bid", () =>
    request("/api/products/auctions/" + open.id + "/bids", token("buyer"), {
      amount: 500,
      idempotencyKey: label + "-open-bid",
    }),
  );
};
