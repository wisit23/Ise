const assert = require("node:assert/strict");
module.exports = async (ctx) => {
  const { step, request, token, state, coverage } = ctx;
  const customer = await ctx.customer("profile-address");
  await step("full-profile-update", () =>
    request(
      "/api/auth/me",
      customer.accessToken,
      {
        firstName: "ผู้ใช้สาธิต",
        lastName: "แก้ข้อมูลบัญชี",
        phone: "0800000002",
      },
      "PATCH",
    ),
  );
  const address = await step("full-profile-address", () =>
    request("/api/auth/me/addresses", customer.accessToken, {
      recipientName: "ผู้รับสาธิต",
      phone: "0800000002",
      addressLine: "101 ถนนสาธิต",
      subdistrict: "ปทุมวัน",
      district: "ปทุมวัน",
      province: "กรุงเทพมหานคร",
      postalCode: "10330",
    }),
  );
  await step("full-profile-address-update", () =>
    request(
      "/api/auth/me/addresses/" + address.id,
      customer.accessToken,
      {
        recipientName: "ผู้รับสาธิตแก้ชื่อ",
        phone: "0800000002",
        addressLine: "102 ถนนสาธิต",
        subdistrict: "ปทุมวัน",
        district: "ปทุมวัน",
        province: "กรุงเทพมหานคร",
        postalCode: "10330",
      },
      "PATCH",
    ),
  );
  await step("full-profile-address-default", () =>
    request(
      "/api/auth/me/addresses/" + address.id + "/default",
      customer.accessToken,
      {},
      "PATCH",
    ),
  );
  await step("full-profile-address-delete", () =>
    request(
      "/api/auth/me/addresses/" + address.id,
      customer.accessToken,
      undefined,
      "DELETE",
    ),
  );
  coverage("auth.profile-and-addresses", [
    "profile edit",
    "address create/edit/default/delete",
    "order snapshots retain independent addresses",
  ]);
  const dispute = state["cs-dispute"];
  for (const side of ["buyer", "seller"]) {
    const role = side;
    const participant = await step("full-dispute-" + side + "-join", () =>
      request(
        "/api/orders/disputes/" + dispute.id + "/conversation",
        token(role),
        { side },
      ),
    );
    await step("full-dispute-" + side + "-cs-join", () =>
      request(
        "/api/orders/disputes/" + dispute.id + "/conversation",
        token("cs"),
        { side },
      ),
    );
    await step("full-dispute-" + side + "-message", () =>
      request(
        "/api/chat/conversations/" + participant.conversationId + "/messages",
        token(role),
        {
          body:
            side === "buyer"
              ? "ขอแจ้งรายละเอียดตำหนิหลังรับสินค้า พร้อมส่งหลักฐานตาม deadline"
              : "ขอชี้แจงสภาพก่อนส่งสินค้าตามภาพในประกาศครับ",
        },
      ),
    );
    await step("full-dispute-" + side + "-reply", () =>
      request(
        "/api/chat/conversations/" + participant.conversationId + "/messages",
        token("cs"),
        { body: "รับคำชี้แจงแล้วครับ จะรวบรวมหลักฐานก่อนส่ง Admin พิจารณา" },
      ),
    );
    await step("full-dispute-" + side + "-cross-room-denied", () =>
      request(
        "/api/chat/conversations/" + participant.conversationId + "/messages",
        token(side === "buyer" ? "seller" : "buyer"),
        undefined,
        "GET",
        403,
      ),
    );
  }
  const messages = await request(
    "/api/chat/conversations/" +
      state["ticket-in-progress-buyer-join"].conversationId +
      "/messages",
    token("buyer"),
  );
  const rows = messages.items || messages.messages || messages;
  assert.ok(Array.isArray(rows));
  assert.ok(
    rows.every((message) => message.visibility !== "INTERNAL"),
    "Customer must never receive staff internal notes",
  );
  coverage("chat.dispute-and-ticket-privacy", [
    "separate buyer/seller dispute conversations",
    "assigned CS replies",
    "cross-side denial",
    "customer cannot read internal notes",
  ]);
  for (const route of [
    "/api/orders/executive/metrics",
    "/api/orders/executive/metrics-series?granularity=day",
    "/api/products/executive/metrics",
    "/api/products/executive/top-catalog",
    "/api/auth/executive/metrics",
    "/api/auth/executive/metrics-series?granularity=day",
    "/api/auth/marketing/analytics/user-usage",
  ])
    await request(
      route,
      token(route.includes("/marketing/") ? "marketing" : "executive"),
    );
  await request("/health", null);
  coverage("gateway.analytics", [
    "authenticated proxy for all five services",
    "executive Auth/Product/Order metrics",
    "public help/product/article browsing",
    "gateway health",
  ]);
};
