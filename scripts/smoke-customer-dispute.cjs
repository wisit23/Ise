// Repeatable, isolated demo case for Buyer/Seller UI acceptance checks.
const fs = require("node:fs");
const { Buffer } = require("node:buffer");
const console = require("node:console");
const process = require("node:process");
const { FormData } = globalThis;
const path = require("node:path");
const assert = require("node:assert/strict");
const {
  request,
  step,
  state,
  label,
  output,
  inspectionImage,
} = require("./seed-local-workflows.cjs");
async function main() {
  const emails = {
    buyer: "buyer.demo@example.com",
    seller: "shop.denim@example.com",
    cs: "cs.nan@example.com",
    otherSeller: "shop.sneaker@example.com",
  };
  const accounts = {};
  for (const [role, email] of Object.entries(emails))
    accounts[role] = await request("/api/auth/login", null, {
      email,
      password: "password123",
    });
  const token = (role) => accounts[role].accessToken;
  const ctx = { step, state, request, label, token };
  require("./local-dataset/commerce.cjs")(ctx);
  const item = await ctx.purchase("customer-dispute-ui-qa");
  const dispute = await step("customer-ui-case", () =>
    request("/api/orders/" + item.order.id + "/disputes", token("buyer"), {
      disputeType: "DAMAGED_ITEM",
      reason:
        "DEMO ตรวจหน้าใช้งานจริง: พบตะเข็บเสียหายหลังรับสินค้า ขอส่งภาพและคำชี้แจงให้ CS ตรวจสอบ",
    }),
  );
  for (const role of ["buyer", "seller"])
    await step("customer-ui-evidence-" + role, async () => {
      const form = new FormData();
      form.append(
        "file",
        await inspectionImage(item.order.id, item.product.id),
        "demo-" + role + "-inspection.png",
      );
      return request(
        "/api/orders/disputes/" + dispute.id + "/evidence",
        token(role),
        form,
      );
    });
  await step("customer-ui-cs-claim", async () => {
    const current = await request(
      "/api/orders/disputes/" + dispute.id,
      token("cs"),
    );
    return request(
      "/api/orders/disputes/" + dispute.id + "/claim",
      token("cs"),
      { version: current.version },
    );
  });
  const rooms = {};
  for (const side of ["buyer", "seller"]) {
    rooms[side] = await request(
      "/api/orders/disputes/" + dispute.id + "/conversation",
      token(side),
      { side },
    );
    await request(
      "/api/orders/disputes/" + dispute.id + "/conversation",
      token("cs"),
      { side },
    );
    await step("customer-ui-message-" + side, () =>
      request(
        "/api/chat/conversations/" + rooms[side].conversationId + "/messages",
        token(side),
        {
          body:
            side === "buyer"
              ? "ส่งภาพตรวจรับสินค้าแล้วครับ ตะเข็บด้านข้างมีรอยขาด"
              : "ขอชี้แจงสภาพสินค้าก่อนจัดส่ง พร้อมแนบภาพให้เจ้าหน้าที่ตรวจสอบครับ",
        },
      ),
    );
    await step("customer-ui-cs-reply-" + side, () =>
      request(
        "/api/chat/conversations/" + rooms[side].conversationId + "/messages",
        token("cs"),
        {
          body: "รับคำชี้แจงและภาพแล้วครับ จะรวบรวมข้อมูลของทั้งสองฝ่ายก่อนส่งให้ผู้ดูแลพิจารณา",
        },
      ),
    );
    await request(
      "/api/chat/conversations/" + rooms[side].conversationId + "/messages",
      token(side === "buyer" ? "seller" : "buyer"),
      undefined,
      "GET",
      403,
    );
  }
  assert.notEqual(rooms.buyer.conversationId, rooms.seller.conversationId);
  for (const role of ["buyer", "seller"]) {
    const actual = await request(
      "/api/orders/disputes/by-order/" + item.order.id,
      token(role),
    );
    assert.ok(
      actual.evidence.some(
        (file) => file.uploaderId === accounts.buyer.user.id,
      ),
    );
    assert.ok(
      actual.evidence.some(
        (file) => file.uploaderId === accounts.seller.user.id,
      ),
    );
    assert.equal(actual.order.productId, item.product.id);
  }
  await request(
    "/api/orders/disputes/by-order/" + item.order.id,
    token("otherSeller"),
    undefined,
    "GET",
    403,
  );
  await request(
    "/api/orders/disputes/" +
      dispute.id +
      "/evidence/" +
      state["customer-ui-evidence-buyer"].id,
    null,
    undefined,
    "GET",
    401,
  );
  const uploadPath = path.join(output, "ui-additional-evidence.png");
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="450"><rect width="1000" height="450" fill="#eef8f1"/><text x="40" y="80" font-size="32">DEMO additional seam inspection</text><text x="40" y="150" font-size="22">Order: ' +
    item.order.id +
    '</text><text x="40" y="220" font-size="22">Additional image for customer UI upload acceptance</text><text x="40" y="350" font-size="24">DEMO ONLY - no real customer evidence</text></svg>';
  await require("sharp")(Buffer.from(svg)).png().toFile(uploadPath);
  const proof = {
    checkedAt: new Date().toISOString(),
    status: "passed",
    orderId: item.order.id,
    disputeId: dispute.id,
    url: "http://localhost:3000/support/cases/" + item.order.id,
    rooms,
    additionalEvidence: path.resolve(uploadPath),
    checks: [
      "buyer/seller private conversations",
      "both parties submit and read evidence",
      "CS replies to both parties",
      "cross-side message access denied",
      "unrelated user denied",
      "unauthenticated private file denied",
    ],
  };
  fs.writeFileSync(
    path.join(output, "customer-dispute-smoke.json"),
    JSON.stringify(proof, null, 2),
  );
  console.log(JSON.stringify(proof, null, 2));
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
