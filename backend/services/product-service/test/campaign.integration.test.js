const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";
if (process.env.DATABASE_URL_PRODUCT) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_PRODUCT;
}

const { signAccessToken } = require("@reloop/shared");
const prisma = require("../src/models/prismaClient");
const app = require("../src/app");

const buyerToken = signAccessToken({
  sub: "buyer-wallet-test-01",
  role: "BUYER",
  displayName: "Buyer Wallet Tester",
});

const buyer2Token = signAccessToken({
  sub: "buyer-wallet-test-02",
  role: "BUYER",
  displayName: "Buyer Two Tester",
});

const sellerToken = signAccessToken({
  sub: "seller-test-01",
  role: "SELLER",
  displayName: "Seller Tester",
});

const marketingToken = signAccessToken({
  sub: "marketing-lead-01",
  role: "MARKETING",
  displayName: "ฝ่ายการตลาด ผู้จัดการแคมเปญ",
});

const adminToken = signAccessToken({
  sub: "admin-eval-01",
  role: "ADMIN",
  displayName: "Admin Approver",
});

async function databaseIsReachable() {
  if (!process.env.DATABASE_URL) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

test("Campaign Domain, State Machine & Voucher Wallet Integration Suite", async (t) => {
  if (!(await databaseIsReachable())) {
    const message = "DATABASE_URL not set or database unreachable";
    if (process.env.REQUIRE_INTEGRATION === "1") {
      throw new Error(`REQUIRE_INTEGRATION=1 but ${message}`);
    }
    t.skip(message);
    return;
  }

  const createdCampaignIds = [];

  t.after(async () => {
    if (createdCampaignIds.length > 0) {
      await prisma.userVoucher.deleteMany({
        where: { campaignId: { in: createdCampaignIds } },
      });
      await prisma.campaign.deleteMany({
        where: { id: { in: createdCampaignIds } },
      });
    }
  });

  const timestamp = Date.now();

  // 1. Guest can browse available published campaigns
  await t.test("Guest access: can browse available campaigns, cannot create", async () => {
    const res = await request(app).get("/campaigns/available");
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));

    const noAuthCreate = await request(app)
      .post("/campaigns")
      .send({ code: `TEST${timestamp}`, name: "No Auth" });
    assert.equal(noAuthCreate.status, 401);
  });

  // 2. Role-Based Access Control (RBAC)
  await t.test("RBAC: BUYER and SELLER forbidden from campaign management", async () => {
    const buyerRes = await request(app)
      .post("/campaigns")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ code: `BUYER${timestamp}`, name: "Buyer Attempt" });
    assert.equal(buyerRes.status, 403);

    const sellerRes = await request(app)
      .post("/campaigns")
      .set("Authorization", `Bearer ${sellerToken}`)
      .send({ code: `SELLER${timestamp}`, name: "Seller Attempt" });
    assert.equal(sellerRes.status, 403);
  });

  // 3. Validation Rules
  await t.test("Validation: rejects invalid inputs (discount, dates, missing fields)", async () => {
    // Missing name
    const missingNameRes = await request(app)
      .post("/campaigns")
      .set("Authorization", `Bearer ${marketingToken}`)
      .send({
        code: `VAL${timestamp}`,
        discountValue: 10,
        startsAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + 86400000).toISOString(),
      });
    assert.equal(missingNameRes.status, 400);

    // Invalid percent (> 100)
    const invalidPercentRes = await request(app)
      .post("/campaigns")
      .set("Authorization", `Bearer ${marketingToken}`)
      .send({
        code: `VAL2${timestamp}`,
        name: "Percent Over 100",
        discountType: "PERCENT",
        discountValue: 120,
        startsAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + 86400000).toISOString(),
      });
    assert.equal(invalidPercentRes.status, 400);

    // Invalid dates (endsAt before startsAt)
    const invalidDatesRes = await request(app)
      .post("/campaigns")
      .set("Authorization", `Bearer ${marketingToken}`)
      .send({
        code: `VAL3${timestamp}`,
        name: "End before Start",
        discountType: "FIXED",
        discountValue: 50,
        startsAt: new Date(Date.now() + 86400000).toISOString(),
        endsAt: new Date().toISOString(),
      });
    assert.equal(invalidDatesRes.status, 400);
  });

  // 4. State Machine & Full Lifecycle
  let lifecycleCampaignId;
  const lifecycleCode = `LIFE_${timestamp}`;

  await t.test("Lifecycle: draft -> pending_approval -> approved -> published -> ended", async () => {
    // Create draft
    const createRes = await request(app)
      .post("/campaigns")
      .set("Authorization", `Bearer ${marketingToken}`)
      .send({
        code: lifecycleCode,
        name: "แคมเปญทดสอบวงจรชีวิต",
        description: "ส่วนลดสำหรับทดสอบ State Machine",
        discountType: "PERCENT",
        discountValue: 15,
        minOrderPrice: 200,
        maxDiscount: 150,
        startsAt: new Date(Date.now() - 3600000).toISOString(), // started 1h ago
        endsAt: new Date(Date.now() + 86400000).toISOString(), // ends in 24h
      });
    assert.equal(createRes.status, 201);
    assert.equal(createRes.body.status, "draft");
    assert.equal(createRes.body.code, lifecycleCode);
    lifecycleCampaignId = createRes.body.id;
    createdCampaignIds.push(lifecycleCampaignId);

    // Duplicate code should conflict
    const dupRes = await request(app)
      .post("/campaigns")
      .set("Authorization", `Bearer ${marketingToken}`)
      .send({
        code: lifecycleCode,
        name: "Duplicate Code Attempt",
        discountValue: 10,
        startsAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + 86400000).toISOString(),
      });
    assert.equal(dupRes.status, 409);

    // Edit while in draft
    const editRes = await request(app)
      .patch(`/campaigns/${lifecycleCampaignId}`)
      .set("Authorization", `Bearer ${marketingToken}`)
      .send({
        name: "แคมเปญทดสอบวงจรชีวิต (แก้ไขชื่อ)",
      });
    assert.equal(editRes.status, 200);
    assert.equal(editRes.body.name, "แคมเปญทดสอบวงจรชีวิต (แก้ไขชื่อ)");

    // Cannot transition straight to published from draft
    const invalidStepRes = await request(app)
      .post(`/campaigns/${lifecycleCampaignId}/publish`)
      .set("Authorization", `Bearer ${marketingToken}`);
    assert.equal(invalidStepRes.status, 409);

    // Submit for approval: draft -> pending_approval
    const submitRes = await request(app)
      .post(`/campaigns/${lifecycleCampaignId}/submit`)
      .set("Authorization", `Bearer ${marketingToken}`);
    assert.equal(submitRes.status, 200);
    assert.equal(submitRes.body.status, "pending_approval");

    // Cannot edit while pending_approval
    const editBlockedRes = await request(app)
      .patch(`/campaigns/${lifecycleCampaignId}`)
      .set("Authorization", `Bearer ${marketingToken}`)
      .send({ name: "Should be blocked" });
    assert.equal(editBlockedRes.status, 409);

    // Approve: pending_approval -> approved (with audit fields)
    const approveRes = await request(app)
      .post(`/campaigns/${lifecycleCampaignId}/approve`)
      .set("Authorization", `Bearer ${marketingToken}`);
    assert.equal(approveRes.status, 200);
    assert.equal(approveRes.body.status, "approved");
    assert.equal(approveRes.body.approvedById, "marketing-lead-01");
    assert.ok(approveRes.body.approvedAt);

    // Publish: approved -> published
    const publishRes = await request(app)
      .post(`/campaigns/${lifecycleCampaignId}/publish`)
      .set("Authorization", `Bearer ${marketingToken}`);
    assert.equal(publishRes.status, 200);
    assert.equal(publishRes.body.status, "published");

    // End: published -> ended
    const endRes = await request(app)
      .post(`/campaigns/${lifecycleCampaignId}/end`)
      .set("Authorization", `Bearer ${marketingToken}`);
    assert.equal(endRes.status, 200);
    assert.equal(endRes.body.status, "ended");
  });

  // 5. Rejection Flow
  await t.test("Lifecycle Rejection: draft -> pending_approval -> rejected", async () => {
    const rejectCode = `REJ_${timestamp}`;
    const draftRes = await request(app)
      .post("/campaigns")
      .set("Authorization", `Bearer ${marketingToken}`)
      .send({
        code: rejectCode,
        name: "แคมเปญที่จะถูกปฏิเสธ",
        discountType: "FIXED",
        discountValue: 100,
        startsAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + 86400000).toISOString(),
      });
    assert.equal(draftRes.status, 201);
    const rejId = draftRes.body.id;
    createdCampaignIds.push(rejId);

    await request(app)
      .post(`/campaigns/${rejId}/submit`)
      .set("Authorization", `Bearer ${marketingToken}`);

    const rejectRes = await request(app)
      .post(`/campaigns/${rejId}/reject`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "งบประมาณไม่เพียงพอ" });
    assert.equal(rejectRes.status, 200);
    assert.equal(rejectRes.body.status, "rejected");
  });

  // 6. Voucher Wallet, Claim Constraint & Smart Compatibility Filter
  await t.test("Voucher Wallet: Claim, 1-per-user uniqueness, and Smart Filter", async () => {
    // Create Campaign 1: DENIM20 (20% off Denim, min 300, max 200)
    const denimCode = `DENIM_${timestamp}`;
    const denimCampRes = await request(app)
      .post("/campaigns")
      .set("Authorization", `Bearer ${marketingToken}`)
      .send({
        code: denimCode,
        name: "ส่วนลดพิเศษคนรักยีนส์ 20%",
        discountType: "PERCENT",
        discountValue: 20,
        minOrderPrice: 300,
        maxDiscount: 200,
        applicableCategory: "Denim",
        startsAt: new Date(Date.now() - 3600000).toISOString(),
        endsAt: new Date(Date.now() + 86400000).toISOString(),
      });
    const denimCampId = denimCampRes.body.id;
    createdCampaignIds.push(denimCampId);

    // Fast-forward to published
    await request(app)
      .post(`/campaigns/${denimCampId}/submit`)
      .set("Authorization", `Bearer ${marketingToken}`);
    await request(app)
      .post(`/campaigns/${denimCampId}/approve`)
      .set("Authorization", `Bearer ${marketingToken}`);
    await request(app)
      .post(`/campaigns/${denimCampId}/publish`)
      .set("Authorization", `Bearer ${marketingToken}`);

    // Create Campaign 2: FLAT50 (Fixed 50 Baht off any category, min 100)
    const flatCode = `FLAT_${timestamp}`;
    const flatCampRes = await request(app)
      .post("/campaigns")
      .set("Authorization", `Bearer ${marketingToken}`)
      .send({
        code: flatCode,
        name: "ลดทันที 50 บาททุกออเดอร์",
        discountType: "FIXED",
        discountValue: 50,
        minOrderPrice: 100,
        startsAt: new Date(Date.now() - 3600000).toISOString(),
        endsAt: new Date(Date.now() + 86400000).toISOString(),
      });
    const flatCampId = flatCampRes.body.id;
    createdCampaignIds.push(flatCampId);

    await request(app)
      .post(`/campaigns/${flatCampId}/submit`)
      .set("Authorization", `Bearer ${marketingToken}`);
    await request(app)
      .post(`/campaigns/${flatCampId}/approve`)
      .set("Authorization", `Bearer ${marketingToken}`);
    await request(app)
      .post(`/campaigns/${flatCampId}/publish`)
      .set("Authorization", `Bearer ${marketingToken}`);

    // Buyer 1 claims Denim coupon
    const claimRes = await request(app)
      .post(`/campaigns/${denimCampId}/claim`)
      .set("Authorization", `Bearer ${buyerToken}`);
    assert.equal(claimRes.status, 201);
    assert.equal(claimRes.body.status, "CLAIMED");
    assert.equal(claimRes.body.userId, "buyer-wallet-test-01");
    assert.equal(claimRes.body.campaignId, denimCampId);

    // Buyer 1 claims Flat 50 coupon
    const claimFlatRes = await request(app)
      .post(`/campaigns/${flatCampId}/claim`)
      .set("Authorization", `Bearer ${buyerToken}`);
    assert.equal(claimFlatRes.status, 201);

    // Duplicate Claim Constraint: Buyer 1 tries to claim Denim coupon again -> 409 Conflict
    const dupClaimRes = await request(app)
      .post(`/campaigns/${denimCampId}/claim`)
      .set("Authorization", `Bearer ${buyerToken}`);
    assert.equal(dupClaimRes.status, 409);
    assert.match(dupClaimRes.body.error, /already claimed/i);

    // Check Buyer 1 Wallet
    const walletRes = await request(app)
      .get("/campaigns/my-vouchers")
      .set("Authorization", `Bearer ${buyerToken}`);
    assert.equal(walletRes.status, 200);
    assert.equal(walletRes.body.length, 2);

    // SMART FILTER EVALUATION:
    // Case 1: Item price 200, Category Denim -> Below minOrderPrice (300) for Denim coupon, but Flat 50 (min 100) applies
    const filterRes1 = await request(app)
      .post("/campaigns/applicable")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ price: 200, category: "Denim" });
    assert.equal(filterRes1.status, 200);
    assert.equal(filterRes1.body.length, 1);
    assert.equal(filterRes1.body[0].campaign.code, flatCode);
    assert.equal(filterRes1.body[0].estimatedDiscount, 50);
    assert.equal(filterRes1.body[0].finalPrice, 150);

    // Case 2: Item price 500, Category Shoes -> Denim coupon excluded due to category mismatch, Flat 50 applies
    const filterRes2 = await request(app)
      .post("/campaigns/applicable")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ price: 500, category: "Shoes" });
    assert.equal(filterRes2.status, 200);
    assert.equal(filterRes2.body.length, 1);
    assert.equal(filterRes2.body[0].campaign.code, flatCode);

    // Case 3: Item price 500, Category Denim -> BOTH apply!
    // Denim discount: 20% of 500 = 100
    // Flat discount: 50
    // Denim should be FIRST (sorted by highest discount)
    const filterRes3 = await request(app)
      .post("/campaigns/applicable")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ price: 500, category: "Denim" });
    assert.equal(filterRes3.status, 200);
    assert.equal(filterRes3.body.length, 2);
    assert.equal(filterRes3.body[0].campaign.code, denimCode);
    assert.equal(filterRes3.body[0].estimatedDiscount, 100);
    assert.equal(filterRes3.body[0].finalPrice, 400);
    assert.equal(filterRes3.body[1].campaign.code, flatCode);
    assert.equal(filterRes3.body[1].estimatedDiscount, 50);

    // Case 4: Item price 2000, Category Denim -> Denim discount capped at maxDiscount 200
    const filterRes4 = await request(app)
      .post("/campaigns/applicable")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ price: 2000, category: "Denim" });
    assert.equal(filterRes4.status, 200);
    assert.equal(filterRes4.body[0].campaign.code, denimCode);
    assert.equal(filterRes4.body[0].estimatedDiscount, 200); // capped at 200 instead of 400
    assert.equal(filterRes4.body[0].finalPrice, 1800);
  });
});
