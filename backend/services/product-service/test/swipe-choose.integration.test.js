const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";
if (process.env.DATABASE_URL_PRODUCT) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_PRODUCT;
} else if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    "postgresql://reloop:reloop_dev_password@localhost:5432/reloop_product";
}

const { signAccessToken } = require("@reloop/shared");
const prisma = require("../src/models/prismaClient");
const app = require("../src/app");

// Mock validateAccessSession so tests don't require running auth-service
app.locals.validateAccessSession = async () => {};

const buyerAToken = signAccessToken({
  sub: "ur11-buyer-a",
  role: "BUYER",
  displayName: "Buyer A",
});

const buyerBToken = signAccessToken({
  sub: "ur11-buyer-b",
  role: "BUYER",
  displayName: "Buyer B",
});

const sellerToken = signAccessToken({
  sub: "ur11-seller",
  role: "SELLER",
  displayName: "Seller Test",
});

const marketingToken = signAccessToken({
  sub: "ur11-marketing",
  role: "MARKETING",
  displayName: "Marketing Test",
});

const adminToken = signAccessToken({
  sub: "ur11-admin",
  role: "ADMIN",
  displayName: "Admin Test",
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

test("UR-11 Swipe-to-Choose Hardening: Buyer authorization, idempotency, feed state, and isolation", async (t) => {
  if (!(await databaseIsReachable())) {
    const message = "DATABASE_URL not set or database unreachable";
    if (process.env.REQUIRE_INTEGRATION === "1") {
      throw new Error(`REQUIRE_INTEGRATION=1 but ${message}`);
    }
    t.skip(message);
    return;
  }

  const testSuffix = Date.now().toString();
  const sellerId = `ur11-seller-${testSuffix}`;

  // Create prerequisite category and condition if not existing
  await prisma.category.upsert({
    where: { name: "vintage" },
    update: {},
    create: { name: "vintage" },
  });
  await prisma.condition.upsert({
    where: { value: "Good" },
    update: {},
    create: { value: "Good", label: "สภาพดี" },
  });

  // Create test product
  const product = await prisma.product.create({
    data: {
      sellerId,
      title: `UR-11 Test Product ${testSuffix}`,
      price: 1500,
      category: "vintage",
      condition: "Good",
      status: "available",
    },
  });

  // Create two product videos
  const video1 = await prisma.productVideo.create({
    data: {
      productId: product.id,
      videoUrl: `/uploads/ur11_v1_${testSuffix}.mp4`,
      description: "Test Video 1",
      sellerId,
      sellerName: "UR-11 Seller",
    },
  });

  const video2 = await prisma.productVideo.create({
    data: {
      productId: product.id,
      videoUrl: `/uploads/ur11_v2_${testSuffix}.mp4`,
      description: "Test Video 2",
      sellerId,
      sellerName: "UR-11 Seller",
    },
  });

  try {
    // 1. Unauthenticated requests return 401
    const unauthPostChoose = await request(app).post(
      `/videos/${video1.id}/choose`,
    );
    assert.equal(unauthPostChoose.status, 401);

    const unauthDeleteChoose = await request(app).delete(
      `/videos/${video1.id}/choose`,
    );
    assert.equal(unauthDeleteChoose.status, 401);

    const unauthPostUnchoose = await request(app).post(
      `/videos/${video1.id}/unchoose`,
    );
    assert.equal(unauthPostUnchoose.status, 401);

    // 2. Non-BUYER roles receive 403 Forbidden (SELLER, MARKETING, ADMIN)
    for (const [roleName, token] of [
      ["SELLER", sellerToken],
      ["MARKETING", marketingToken],
      ["ADMIN", adminToken],
    ]) {
      const chooseRes = await request(app)
        .post(`/videos/${video1.id}/choose`)
        .set("Authorization", `Bearer ${token}`);
      assert.equal(
        chooseRes.status,
        403,
        `Expected 403 for ${roleName} on POST /choose`,
      );

      const deleteRes = await request(app)
        .delete(`/videos/${video1.id}/choose`)
        .set("Authorization", `Bearer ${token}`);
      assert.equal(
        deleteRes.status,
        403,
        `Expected 403 for ${roleName} on DELETE /choose`,
      );

      const unchooseRes = await request(app)
        .post(`/videos/${video1.id}/unchoose`)
        .set("Authorization", `Bearer ${token}`);
      assert.equal(
        unchooseRes.status,
        403,
        `Expected 403 for ${roleName} on POST /unchoose`,
      );
    }

    // 3. Buyer A chooses video1 successfully
    const buyerChooseRes = await request(app)
      .post(`/videos/${video1.id}/choose`)
      .set("Authorization", `Bearer ${buyerAToken}`);
    assert.equal(buyerChooseRes.status, 200);
    assert.equal(buyerChooseRes.body.chosen, true);
    assert.equal(buyerChooseRes.body.productVideoId, video1.id);
    assert.equal(buyerChooseRes.body.userId, "ur11-buyer-a");

    // Verify DB record exists
    const dbChoice = await prisma.swipeChoice.findUnique({
      where: {
        productVideoId_userId: {
          productVideoId: video1.id,
          userId: "ur11-buyer-a",
        },
      },
    });
    assert.ok(dbChoice, "SwipeChoice record must be persisted in database");

    // 4. Repeated choose on the same video is idempotent and does not create duplicate rows
    const repeatedChooseRes = await request(app)
      .post(`/videos/${video1.id}/choose`)
      .set("Authorization", `Bearer ${buyerAToken}`);
    assert.equal(repeatedChooseRes.status, 200);
    assert.equal(repeatedChooseRes.body.chosen, true);

    const choiceCount = await prisma.swipeChoice.count({
      where: {
        productVideoId: video1.id,
        userId: "ur11-buyer-a",
      },
    });
    assert.equal(choiceCount, 1, "Repeated choose must not duplicate records");

    // 5. Feed state verification:
    // 5a. Guest browsing: chosen must be false for all items
    const guestFeedRes = await request(app).get("/videos/feed");
    assert.equal(guestFeedRes.status, 200);
    const guestItem1 = guestFeedRes.body.items.find(
      (item) => item.id === video1.id,
    );
    const guestItem2 = guestFeedRes.body.items.find(
      (item) => item.id === video2.id,
    );
    assert.ok(guestItem1, "video1 should be present in feed");
    assert.equal(guestItem1.chosen, false);
    assert.equal(guestItem2.chosen, false);
    assert.equal(guestItem1.choices, undefined, "choices relation omitted");

    // 5b. Authenticated Buyer A browsing: video1 chosen: true, video2 chosen: false
    const buyerAFeedRes = await request(app)
      .get("/videos/feed")
      .set("Authorization", `Bearer ${buyerAToken}`);
    assert.equal(buyerAFeedRes.status, 200);
    const buyerAItem1 = buyerAFeedRes.body.items.find(
      (item) => item.id === video1.id,
    );
    const buyerAItem2 = buyerAFeedRes.body.items.find(
      (item) => item.id === video2.id,
    );
    assert.equal(buyerAItem1.chosen, true);
    assert.equal(buyerAItem2.chosen, false);

    // 5c. Authenticated Buyer B browsing (isolation test): video1 and video2 both chosen: false
    const buyerBFeedRes = await request(app)
      .get("/videos/feed")
      .set("Authorization", `Bearer ${buyerBToken}`);
    assert.equal(buyerBFeedRes.status, 200);
    const buyerBItem1 = buyerBFeedRes.body.items.find(
      (item) => item.id === video1.id,
    );
    const buyerBItem2 = buyerBFeedRes.body.items.find(
      (item) => item.id === video2.id,
    );
    assert.equal(
      buyerBItem1.chosen,
      false,
      "Buyer B must not see Buyer A's choice",
    );
    assert.equal(buyerBItem2.chosen, false);

    // 5d. Client sending spoofed x-user-id without token CANNOT read chosen state of that user
    const spoofedFeedRes = await request(app)
      .get("/videos/feed")
      .set("x-user-id", "ur11-buyer-a")
      .set("x-user-role", "BUYER");
    assert.equal(spoofedFeedRes.status, 200);
    const spoofedItem1 = spoofedFeedRes.body.items.find(
      (item) => item.id === video1.id,
    );
    assert.ok(spoofedItem1, "video1 should be present in feed");
    assert.equal(
      spoofedItem1.chosen,
      false,
      "Sending x-user-id without Authorization token must not grant access to user's chosen state",
    );
    assert.equal(spoofedItem1.choices, undefined);

    // 6. Unchoose an item that is NOT chosen does not crash and returns chosen: false (no 500 error)
    const unchosenDeleteRes = await request(app)
      .delete(`/videos/${video2.id}/choose`)
      .set("Authorization", `Bearer ${buyerAToken}`);
    assert.equal(unchosenDeleteRes.status, 200);
    assert.equal(unchosenDeleteRes.body.chosen, false);

    const unchosenPostRes = await request(app)
      .post(`/videos/${video2.id}/unchoose`)
      .set("Authorization", `Bearer ${buyerAToken}`);
    assert.equal(unchosenPostRes.status, 200);
    assert.equal(unchosenPostRes.body.chosen, false);

    // 7. Buyer A unchooses video1 via DELETE /videos/:id/choose
    const deleteRes = await request(app)
      .delete(`/videos/${video1.id}/choose`)
      .set("Authorization", `Bearer ${buyerAToken}`);
    assert.equal(deleteRes.status, 200);
    assert.equal(deleteRes.body.chosen, false);

    // Verify DB record is deleted
    const dbChoiceAfterDelete = await prisma.swipeChoice.findUnique({
      where: {
        productVideoId_userId: {
          productVideoId: video1.id,
          userId: "ur11-buyer-a",
        },
      },
    });
    assert.equal(dbChoiceAfterDelete, null);

    // Verify feed reflects unchosen state
    const buyerAFeedAfterUnchoose = await request(app)
      .get("/videos/feed")
      .set("Authorization", `Bearer ${buyerAToken}`);
    const unchosenItem1 = buyerAFeedAfterUnchoose.body.items.find(
      (item) => item.id === video1.id,
    );
    assert.equal(unchosenItem1.chosen, false);

    // 8. Test alternative route POST /videos/:id/unchoose
    // Buyer A chooses video2 first
    await request(app)
      .post(`/videos/${video2.id}/choose`)
      .set("Authorization", `Bearer ${buyerAToken}`);
    const choice2InDb = await prisma.swipeChoice.findUnique({
      where: {
        productVideoId_userId: {
          productVideoId: video2.id,
          userId: "ur11-buyer-a",
        },
      },
    });
    assert.ok(choice2InDb);

    // Buyer A unchooses video2 via POST /unchoose
    const postUnchooseRes = await request(app)
      .post(`/videos/${video2.id}/unchoose`)
      .set("Authorization", `Bearer ${buyerAToken}`);
    assert.equal(postUnchooseRes.status, 200);
    assert.equal(postUnchooseRes.body.chosen, false);

    const choice2AfterPostUnchoose = await prisma.swipeChoice.findUnique({
      where: {
        productVideoId_userId: {
          productVideoId: video2.id,
          userId: "ur11-buyer-a",
        },
      },
    });
    assert.equal(choice2AfterPostUnchoose, null);
  } finally {
    // Teardown test data
    await prisma.swipeChoice.deleteMany({
      where: { productVideoId: { in: [video1.id, video2.id] } },
    });
    await prisma.productVideo.deleteMany({
      where: { id: { in: [video1.id, video2.id] } },
    });
    await prisma.product.deleteMany({
      where: { id: product.id },
    });
  }
});
