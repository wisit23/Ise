const assert = require("node:assert/strict");
module.exports = async (ctx) => {
  const {
    step,
    request,
    token,
    state,
    label,
    image,
    coverage,
    binary,
    purchase,
  } = ctx;
  await purchase("seller-is-buyer", { buyer: "otherSeller" });
  const products = [
    await ctx.listing("multi-seller-one"),
    await ctx.listing("multi-seller-two", "otherSeller"),
  ];
  const orders = [];
  for (const [index, product] of products.entries())
    orders.push(
      await step("full-multi-order-" + index, () =>
        request("/api/orders", token("buyer"), { productId: product.id }),
      ),
    );
  const multi = await step("full-multi-checkout", () =>
    request("/api/orders/checkout-sessions", token("buyer"), {
      orderIds: orders.map((order) => order.id),
      addressId: state["buyer-address"].id,
      shippingAddress: state["buyer-address"],
    }),
  );
  await step("full-multi-address-change", () =>
    request(
      "/api/orders/checkout-sessions/" + multi.id + "/address",
      token("buyer"),
      {
        addressId: state["buyer-address"].id,
        shippingAddress: state["buyer-address"],
      },
      "PATCH",
    ),
  );
  await step("full-multi-payment", () =>
    request(
      "/api/orders/checkout-sessions/" + multi.id + "/confirm",
      token("buyer"),
      {},
    ),
  );
  await step("full-multi-payment-retry", () =>
    request(
      "/api/orders/checkout-sessions/" + multi.id + "/confirm",
      token("buyer"),
      {},
    ),
  );
  const cancelCampaign = await step("full-cancel-voucher-campaign", () =>
    request("/api/products/campaigns", token("marketing"), {
      code: "CANCEL" + label,
      name: "DEMO คูปองสำหรับตรวจการคืนสิทธิ์เมื่อยกเลิก",
      discountType: "FIXED",
      discountValue: 50,
      minOrderPrice: 100,
      budget: 5000,
      usageLimit: 50,
      startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 30 * 86400000).toISOString(),
    }),
  );
  for (const action of ["submit", "approve", "publish"])
    await step("full-cancel-campaign-" + action, () =>
      request(
        "/api/products/campaigns/" + cancelCampaign.id + "/" + action,
        token("marketing"),
        {},
      ),
    );
  await step("full-cancel-voucher-claim", () =>
    request(
      "/api/products/campaigns/" + cancelCampaign.id + "/claim",
      token("buyer"),
      {},
    ),
  );
  await purchase("cancelled-cart", {
    stage: "cancelled",
    campaignId: cancelCampaign.id,
  });
  const paid = await purchase("address-change-safety-release", {
    stage: "paid",
  });
  const address = await step("full-alternative-address", () =>
    request("/api/auth/me/addresses", token("buyer"), {
      recipientName: "สมชาย ที่อยู่สำรองสาธิต",
      phone: "0800000001",
      addressLine: "100 ถนนสาธิต",
      subdistrict: "ปทุมวัน",
      district: "ปทุมวัน",
      province: "กรุงเทพมหานคร",
      postalCode: "10330",
    }),
  );
  await step("full-paid-address-change", async () => {
    const current = await request(
      "/api/orders/" + paid.order.id,
      token("buyer"),
    );
    return request(
      "/api/orders/" + paid.order.id + "/shipping-address",
      token("buyer"),
      {
        addressId: address.id,
        shippingAddress: address,
        version: current.version,
      },
      "PATCH",
    );
  });
  for (const action of ["hold", "release"])
    await step("full-safety-" + action, async () => {
      const current = await request(
        "/api/orders/" + paid.order.id,
        token("buyer"),
      );
      return request(
        "/api/orders/admin/" + paid.order.id + "/" + action,
        token("trust"),
        {
          version: current.version,
          reason:
            action === "hold"
              ? "DEMO ตรวจรายการชำระและที่อยู่ก่อนจัดส่ง"
              : "ตรวจรายการสาธิตเรียบร้อย อนุญาตให้จัดส่งต่อ",
        },
      );
    });
  const item = await purchase("seller-verdict-release");
  const dispute = await step("full-seller-release-dispute", () =>
    request("/api/orders/" + item.order.id + "/disputes", token("buyer"), {
      reason: "DEMO ขอให้ตรวจตำหนิตามภาพและคำชี้แจงผู้ขาย",
      disputeType: "ITEM_NOT_AS_DESCRIBED",
    }),
  );
  const evidence = await step("full-seller-release-evidence", async () => {
    const form = new FormData();
    form.append(
      "file",
      await image("DEMO DISPUTE INSPECTION", [
        "Order: " + item.order.id,
        "Product: " + item.product.id,
        "Scenario: ตรวจรอยใช้งานตามคำชี้แจงผู้ขาย",
      ]),
      "demo-verdict.png",
    );
    return request(
      "/api/orders/disputes/" + dispute.id + "/evidence",
      token("buyer"),
      form,
    );
  });
  await step("full-evidence-private-read", async () => {
    await binary(
      "/api/orders/disputes/" + dispute.id + "/evidence/" + evidence.id,
      token("buyer"),
    );
    await binary(
      "/api/orders/disputes/" + dispute.id + "/evidence/" + evidence.id,
      token("otherSeller"),
      403,
    );
    return { participantAllowed: true, unrelatedBuyerDenied: true };
  });
  await step("full-evidence-safety-verify", () =>
    request(
      "/api/orders/admin/" +
        item.order.id +
        "/evidence/" +
        evidence.id +
        "/verify",
      token("trust"),
      {
        version: evidence.version,
        status: "VERIFIED",
        detail:
          "DEMO ตรวจไฟล์และความเชื่อมโยงกับคำสั่งซื้อแล้ว เป็นหลักฐานสาธิตที่ตรงรายการ",
      },
      "PATCH",
    ),
  );
  for (const action of ["cs-claim", "escalate", "admin-claim", "decision"])
    await step("full-release-" + action, async () => {
      const role =
        action.startsWith("admin") || action === "decision" ? "admin" : "cs";
      const current = await request(
        "/api/orders/disputes/" + dispute.id,
        token(role),
      );
      const route = action.endsWith("claim") ? "claim" : action;
      return request(
        "/api/orders/disputes/" + dispute.id + "/" + route,
        token(role),
        {
          version: current.version,
          ...(action === "escalate"
            ? {
                reason:
                  "ปัญหา: ต้องเทียบตำหนิกับประกาศ\nขาดอำนาจ: CS ไม่ตัดสินเงิน\nข้อเสนอแนะ: Admin ตรวจคำชี้แจงและภาพก่อนตัดสิน",
              }
            : action === "decision"
              ? {
                  decision: "RELEASE_ESCROW",
                  reason:
                    "DEMO ภาพและคำชี้แจงแสดงตำหนิไว้ก่อนซื้อ จึงอนุญาตให้ปล่อยเงินแก่ผู้ขาย",
                  idempotencyKey: label + "-release-verdict",
                }
              : {}),
        },
      );
    });
  coverage("order.checkout-and-safety", [
    "SELLER purchases",
    "multi-seller checkout and payment retry",
    "cancel cart and release voucher",
    "checkout and paid shipping address update",
    "T&S hold/release without verdict",
    "refund and release-escrow Admin verdict",
    "private evidence read and safety verification",
  ]);
  const room = item.room;
  const attached = await step("full-chat-image", async () => {
    const form = new FormData();
    form.append(
      "file",
      await image("DEMO CHAT ITEM DETAIL", [
        "Product: " + item.product.id,
        "ภาพประกอบคำชี้แจงสภาพสินค้า",
      ]),
      "demo-chat.png",
    );
    form.append("caption", "ภาพรายละเอียดสาธิตสำหรับคำชี้แจงสินค้า");
    return request(
      "/api/chat/conversations/" + room.id + "/attachments",
      token("seller"),
      form,
    );
  });
  await step("full-chat-private-download", async () => {
    await binary(
      "/api/chat/conversations/" + room.id + "/attachments/" + attached.id,
      token("buyer"),
    );
    await binary(
      "/api/chat/conversations/" + room.id + "/attachments/" + attached.id,
      token("otherSeller"),
      403,
    );
    return { participantAllowed: true, outsiderDenied: true };
  });
  await request(
    "/api/chat/conversations/" + room.id + "/read",
    token("buyer"),
    {},
  );
  await request("/api/chat/unread-count", token("buyer"));
  const history = await request(
    "/api/orders/disputes/" + dispute.id + "/chat-history",
    token("trust"),
  );
  assert.equal(history.conversation.id, room.id);
  coverage("chat.private-messaging", [
    "product conversations",
    "customer/seller replies and system payment notices",
    "private image attachment download",
    "outsider denial",
    "mark-read/unread",
    "dispute oversight",
    "ticket customer/internal messages",
  ]);
};
