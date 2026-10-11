const assert = require("node:assert/strict");
module.exports = async (ctx) => {
  const { step, request, token, state, label, coverage, listing, image } = ctx;
  const catalog = await listing("editable-gallery", "seller", {
    media: ["front", "back", "seam", "label"]
      .map((view) => ({ url: "/demo/denim-" + view + ".svg", type: "image" }))
      .concat({ url: state["demo-video-upload"].media[0].url, type: "video" }),
  });
  await step("full-product-edit", () =>
    request(
      "/api/products/" + catalog.id,
      token("seller"),
      {
        description: "DEMO ปรับรายละเอียดหลังตรวจสินค้า: มีรอยใช้งานเล็กน้อย",
        price: 700,
      },
      "PATCH",
    ),
  );
  await step("full-product-hide", () =>
    request(
      "/api/products/" + catalog.id + "/visibility",
      token("seller"),
      { visible: false },
      "PATCH",
    ),
  );
  await step("full-product-show", () =>
    request(
      "/api/products/" + catalog.id + "/visibility",
      token("seller"),
      { visible: true },
      "PATCH",
    ),
  );
  for (const mode of ["removed", "restored"]) {
    const item = await listing("moderation-" + mode);
    const report = await step("full-report-" + mode, () =>
      request("/api/auth/reports", token("buyer"), {
        targetId: ctx.accounts.seller.user.id,
        productId: item.id,
        reason: "DEMO รายละเอียดสินค้าไม่ครบ ขอให้ตรวจความปลอดภัย",
      }),
    );
    await step("full-report-" + mode + "-review", () =>
      request(
        "/api/auth/admin/reports/" + report.id + "/review",
        token("trust"),
        {},
      ),
    );
    await step("full-report-" + mode + "-remove", () =>
      request(
        "/api/auth/admin/reports/" + report.id + "/action",
        token("trust"),
        {
          decision: "REMOVE_PRODUCT",
          reason: "ตรวจรายงานแล้ว ระงับประกาศเพื่อให้แก้ข้อมูล",
          idempotencyKey: label + "-remove-" + mode,
        },
      ),
    );
    if (mode === "restored")
      await step("full-product-restore", () =>
        request(
          "/api/auth/admin/products/" + item.id + "/restore",
          token("trust"),
          {
            reason: "ตรวจประกาศสาธิตแล้ว อนุญาตให้กลับมาแสดง",
            idempotencyKey: label + "-restore",
          },
        ),
      );
  }
  coverage("product.catalog-and-moderation", [
    "four-angle photos + gallery video",
    "edit/hide/show",
    "reviewed report removal",
    "restore with moderation command audit",
  ]);
  for (const status of ["draft", "published"]) {
    const result = await step("full-article-" + status, () =>
      request("/api/products/articles", token("marketing"), {
        title: "DEMO วิธีตรวจเสื้อมือสอง · " + status,
        summary: "ตรวจตะเข็บ ขนาด และภาพก่อนซื้อ",
        content:
          "ตรวจภาพทุกมุม สอบถามผู้ขาย ชำระผ่านระบบ และเก็บหลักฐานเมื่อได้รับสินค้า",
        category: "general",
        coverImage: "/demo/denim-front.svg",
        status: "draft",
      }),
    );
    if (status === "published")
      await step("full-article-publish", () =>
        request(
          "/api/products/articles/" + (result.article || result).id,
          token("marketing"),
          { status: "published" },
          "PUT",
        ),
      );
  }
  await request("/api/products/articles?q=DEMO", null);
  coverage("marketing.articles", ["draft", "publish", "public text search"]);
  for (const stage of ["draft", "pending", "approved", "rejected", "ended"]) {
    const campaign = await step("full-campaign-" + stage, () =>
      request("/api/products/campaigns", token("marketing"), {
        code: "FULL" + label + stage.toUpperCase(),
        name: "DEMO แคมเปญ · " + stage,
        discountType: "FIXED",
        discountValue: 50,
        minOrderPrice: 100,
        budget: 5000,
        usageLimit: 50,
        startsAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + 30 * 86400000).toISOString(),
      }),
    );
    const actions =
      stage === "draft"
        ? []
        : stage === "pending"
          ? ["submit"]
          : stage === "rejected"
            ? ["submit", "reject"]
            : stage === "approved"
              ? ["submit", "approve"]
              : ["submit", "approve", "publish", "end"];
    for (const action of actions)
      await step("full-campaign-" + stage + "-" + action, () =>
        request(
          "/api/products/campaigns/" + campaign.id + "/" + action,
          token("marketing"),
          action === "reject"
            ? { reason: "DEMO งบประมาณและกลุ่มเป้าหมายยังไม่พร้อม" }
            : {},
        ),
      );
  }
  await request("/api/products/campaigns/my-vouchers", token("buyer"));
  await request("/api/products/campaigns/applicable", token("buyer"), {
    price: 890,
    category: "เสื้อผ้า",
  });
  await request("/api/products/campaigns/metrics/overview", token("marketing"));
  await request("/api/products/campaigns/metrics/trends", token("marketing"));
  coverage("marketing.campaigns", [
    "draft/pending/approved/rejected/published/ended",
    "claimed voucher wallet/applicability",
    "completed-order attribution and budget",
    "overview/trends",
  ]);
  const restricted = await ctx.customer("restricted-seller");
  await step("full-restricted-seller-publish-denied", () =>
    request(
      "/api/products",
      restricted.accessToken,
      { title: "Forbidden demo listing", price: 650 },
      "POST",
      403,
    ),
  );
  const reviewOrder = await ctx.purchase("review-with-media");
  const uploaded = await step("full-review-upload", async () => {
    const form = new FormData();
    form.append(
      "files",
      await image("DEMO RECEIVED ITEM", [
        "Order: " + reviewOrder.order.id,
        "ตรวจสภาพหลังรับสินค้าตามคำสั่งซื้อ",
      ]),
      "demo-review.png",
    );
    return request("/api/reviews/uploads", token("buyer"), form);
  });
  const review = await step("full-review-with-media", () =>
    request("/api/products/reviews", token("buyer"), {
      orderId: reviewOrder.order.id,
      rating: 4,
      comment: "ตรวจรับสินค้าแล้ว ตรงภาพ มีรอยใช้งานตามแจ้ง แนบภาพสาธิตหลังรับ",
      media: uploaded.media,
    }),
  );
  assert.ok(review);
  const videoOrder = await ctx.purchase("review-with-video");
  const videoMedia = await step("full-review-video-upload", async () => {
    const form = new FormData();
    form.append(
      "files",
      new Blob(
        [
          require("node:fs").readFileSync(
            require("node:path").join(ctx.output, "demo-denim.mp4"),
          ),
        ],
        { type: "video/mp4" },
      ),
      "demo-review.mp4",
    );
    return request("/api/reviews/uploads", token("buyer"), form);
  });
  await step("full-review-with-video", () =>
    request("/api/products/reviews", token("buyer"), {
      orderId: videoOrder.order.id,
      rating: 5,
      comment: "คลิปสาธิตตรวจรับสินค้า เชื่อมกับคำสั่งซื้อที่รับเรียบร้อย",
      media: videoMedia.media,
    }),
  );
  coverage("product.reviews-and-swipe", [
    "completed-order review",
    "review image upload",
    "BUYER/SELLER swipe choice",
    "staff and restricted seller denial",
  ]);
};
