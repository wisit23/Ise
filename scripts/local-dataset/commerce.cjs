module.exports = function utilities(ctx) {
  const { step, request, token, state, label } = ctx;
  const photos = ["front", "back", "seam", "label"].map((view) => ({
    url: "/demo/denim-" + view + ".svg",
    type: "image",
  }));
  ctx.listing = (key, seller = "seller", extra = {}) =>
    step("full-" + key + "-product", () =>
      request("/api/products", token(seller), {
        title: "DEMO · " + key,
        description: "สินค้ามือสองสาธิต ตรวจสภาพและรายละเอียดก่อนซื้อ",
        price: 650,
        category: "เสื้อผ้า",
        condition: "Good",
        size: "M",
        brand: "Demo Denim",
        media: photos,
        ...extra,
      }),
    );
  ctx.addressFor = (buyer) =>
    buyer === "buyer"
      ? Promise.resolve(state["buyer-address"])
      : step("full-" + buyer + "-address", () =>
          request("/api/auth/me/addresses", token(buyer), {
            recipientName: "ผู้ซื้อสาธิต " + buyer,
            phone: "0800000000",
            addressLine: "99 ถนนสาธิต",
            subdistrict: "ปทุมวัน",
            district: "ปทุมวัน",
            province: "กรุงเทพมหานคร",
            postalCode: "10330",
          }),
        );
  ctx.purchase = async (
    key,
    {
      buyer = "buyer",
      seller = "seller",
      stage = "completed",
      campaignId,
    } = {},
  ) => {
    const product = await ctx.listing(key, seller);
    const room = await step("full-" + key + "-room", () =>
      request("/api/chat/conversations", token(buyer), {
        contextType: "PRODUCT",
        productId: product.id,
      }),
    );
    await step("full-" + key + "-inquiry", () =>
      request(
        "/api/chat/conversations/" + room.id + "/messages",
        token(buyer),
        { body: "ขอตรวจสภาพและขนาดก่อนสั่งซื้อครับ" },
      ),
    );
    await step("full-" + key + "-answer", () =>
      request(
        "/api/chat/conversations/" + room.id + "/messages",
        token(seller),
        { body: "รายละเอียดตรงตามภาพสาธิต พร้อมจัดส่งผ่านระบบครับ" },
      ),
    );
    const order = await step("full-" + key + "-order", () =>
      request("/api/orders", token(buyer), {
        productId: product.id,
        ...(campaignId ? { campaignId } : {}),
      }),
    );
    if (stage === "cancelled") {
      await step("full-" + key + "-cancel", async () => {
        const current = await request("/api/orders/" + order.id, token(buyer));
        return request(
          "/api/orders/" + order.id + "/status",
          token(buyer),
          { status: "cancelled", version: current.version },
          "PATCH",
        );
      });
      return { order, product, room };
    }
    const address = await ctx.addressFor(buyer);
    const checkout = await step("full-" + key + "-checkout", () =>
      request("/api/orders/checkout-sessions", token(buyer), {
        orderIds: [order.id],
        addressId: address.id,
        shippingAddress: address,
      }),
    );
    if (stage !== "pending")
      await step("full-" + key + "-payment", () =>
        request(
          "/api/orders/checkout-sessions/" + checkout.id + "/confirm",
          token(buyer),
          {},
        ),
      );
    // Seller accepts and packs before shipping (paid -> confirmed -> ready_to_ship).
    if (["shipped", "completed"].includes(stage))
      for (const status of ["confirmed", "ready_to_ship"])
        await step("full-" + key + "-" + status, () =>
          request(
            "/api/orders/" + order.id + "/status",
            token(seller),
            { status },
            "PATCH",
          ),
        );
    if (["shipped", "completed"].includes(stage))
      await step("full-" + key + "-ship", async () => {
        const current = await request("/api/orders/" + order.id, token(seller));
        return request(
          "/api/orders/" + order.id + "/status",
          token(seller),
          {
            status: "shipped",
            version: current.version,
            company: "Demo Express",
            trackingNumber: "DEMO-" + label + "-" + key,
          },
          "PATCH",
        );
      });
    if (stage === "completed")
      await step("full-" + key + "-receive", async () => {
        // order-service simulates the carrier: shipped becomes delivered
        // after ORDER_DELIVERY_DELAY_MS (10s by default).
        let current = await request("/api/orders/" + order.id, token(buyer));
        for (let i = 0; i < 30 && current.status !== "delivered"; i++) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          current = await request("/api/orders/" + order.id, token(buyer));
        }
        return request(
          "/api/orders/" + order.id + "/status",
          token(buyer),
          { status: "completed", version: current.version },
          "PATCH",
        );
      });
    return { order, product, checkout, room, address };
  };
};
