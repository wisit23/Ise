// Integration test against a real, disposable Postgres database (reloop_product).
// Skips cleanly when DATABASE_URL is unset/unreachable so `npm test` still
// passes on a machine with no database configured. Set REQUIRE_INTEGRATION=1
// (the CI workflow does) to turn that skip into a hard failure instead.
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";
process.env.INTERNAL_SERVICE_TOKEN ||= "test-internal-token";
if (process.env.DATABASE_URL_PRODUCT) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_PRODUCT;
}

const prisma = require("../src/models/prismaClient");
const app = require("../src/app");
const { signAccessToken, permissionsForRoles } = require("@reloop/shared");
app.locals.validateAccessSession = async () => {};

const TEST_TITLE_PREFIX = "adm-003-moderation-integration-test ";

async function databaseIsReachable() {
  if (!process.env.DATABASE_URL) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (err) {
    if (process.env.REQUIRE_INTEGRATION === "1") {
      console.error(
        "moderation integration database check failed:",
        err.message,
      );
    }
    return false;
  }
}

test("product moderation removes, hides and restores a listing", async (t) => {
  if (!(await databaseIsReachable())) {
    const message =
      "DATABASE_URL not set or database unreachable — set it to a disposable test database " +
      "(after running `npx prisma db push` against it from backend/services/product-service) to run this test";
    if (process.env.REQUIRE_INTEGRATION === "1") {
      throw new Error(`REQUIRE_INTEGRATION=1 but ${message}`);
    }
    t.skip(message);
    return;
  }

  const product = await prisma.product.create({
    data: {
      sellerId: "int-test-seller",
      title: `${TEST_TITLE_PREFIX}available item`,
      price: 500,
      category: "misc",
      status: "available",
    },
  });
  const clip = await prisma.productVideo.create({
    data: {
      productId: product.id,
      sellerId: product.sellerId,
      sellerName: "Moderation Seller",
      videoUrl: "https://example.test/moderation-clip.mp4",
      description: "moderation visibility fixture",
    },
  });
  let reservedProduct;
  let auctionWinnerProduct;

  try {
    const sellerToken = signAccessToken({
      sub: product.sellerId,
      role: "SELLER",
      roles: ["SELLER"],
      permissions: permissionsForRoles(["SELLER"]),
    });
    const buyerToken = signAccessToken({
      sub: "moderation-buyer",
      role: "BUYER",
      roles: ["BUYER"],
      permissions: permissionsForRoles(["BUYER"]),
    });
    const staffToken = signAccessToken({
      sub: "moderation-staff",
      role: "TRUST_AND_SAFETY",
      roles: ["TRUST_AND_SAFETY"],
      permissions: permissionsForRoles(["TRUST_AND_SAFETY"]),
    });
    const removeKey = `remove-${product.id}`;
    const restoreKey = `restore-${product.id}`;
    const internalDetailRes = await request(app)
      .get(`/internal/moderation/${product.id}`)
      .set("x-internal-token", process.env.INTERNAL_SERVICE_TOKEN);
    assert.equal(internalDetailRes.status, 200);
    assert.equal(internalDetailRes.body.id, product.id);
    assert.equal(internalDetailRes.body.title, product.title);

    // Visible before any moderation action.
    const beforeRes = await request(app).get("/feed");
    assert.ok(beforeRes.body.items.some((p) => p.id === product.id));
    assert.equal((await request(app).get(`/${product.id}`)).status, 200);
    assert.ok(
      (
        await request(app).get(`/by-seller/${product.sellerId}`)
      ).body.items.some((p) => p.id === product.id),
    );
    assert.ok(
      (await request(app).get("/videos/feed")).body.items.some(
        (item) => item.id === clip.id,
      ),
    );

    // No internal token must be rejected before touching state.
    const deniedRes = await request(app)
      .post(`/internal/moderation/${product.id}/remove`)
      .send({ reason: "counterfeit listing" });
    assert.equal(deniedRes.status, 403);

    // Removal must hide the listing from public browsing (search/feed only
    // match status "available") while remembering the prior status for restore.
    const removeRes = await request(app)
      .post(`/internal/moderation/${product.id}/remove`)
      .set({
        "x-internal-token": process.env.INTERNAL_SERVICE_TOKEN,
        "x-idempotency-key": removeKey,
      })
      .send({ reason: "counterfeit listing" });
    assert.equal(removeRes.status, 200);
    assert.equal(removeRes.body.status, "removed");
    assert.equal(removeRes.body.commerceStatus, "available");
    assert.equal(removeRes.body.preRemovalStatus, "available");

    const afterRemoveRes = await request(app).get("/feed");
    assert.equal(
      afterRemoveRes.body.items.some((p) => p.id === product.id),
      false,
    );
    assert.equal((await request(app).get(`/${product.id}`)).status, 404);
    assert.equal(
      (
        await request(app).get(`/search?q=${encodeURIComponent(product.title)}`)
      ).body.items.some((p) => p.id === product.id),
      false,
    );
    assert.equal(
      (
        await request(app).get(`/by-seller/${product.sellerId}`)
      ).body.items.some((p) => p.id === product.id),
      false,
    );
    assert.equal(
      (await request(app).get("/videos/feed")).body.items.some(
        (item) => item.id === clip.id,
      ),
      false,
    );
    assert.equal(
      (
        await request(app)
          .post(`/videos/${clip.id}/choose`)
          .set("Authorization", `Bearer ${buyerToken}`)
      ).status,
      404,
    );

    const ownerDetail = await request(app)
      .get(`/${product.id}`)
      .set("x-user-id", product.sellerId);
    assert.equal(ownerDetail.status, 200);
    assert.equal(ownerDetail.body.status, "removed");
    assert.equal(ownerDetail.body.moderationReason, "counterfeit listing");

    const staffDetail = await request(app)
      .get(`/admin/${product.id}`)
      .set("Authorization", `Bearer ${staffToken}`);
    assert.equal(staffDetail.status, 200);
    assert.equal(staffDetail.body.status, "removed");

    const staffSearch = await request(app)
      .get("/admin/search?status=removed")
      .set("Authorization", `Bearer ${staffToken}`);
    assert.equal(staffSearch.status, 200);
    assert.ok(staffSearch.body.items.some((p) => p.id === product.id));

    const deniedStaffDetail = await request(app)
      .get(`/admin/${product.id}`)
      .set("Authorization", `Bearer ${buyerToken}`);
    assert.equal(deniedStaffDetail.status, 403);

    for (const mutation of [
      request(app)
        .patch(`/${product.id}`)
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({ title: "seller tried to rewrite evidence" }),
      request(app)
        .patch(`/${product.id}/visibility`)
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({ visible: true }),
      request(app)
        .delete(`/${product.id}`)
        .set("Authorization", `Bearer ${sellerToken}`),
    ]) {
      assert.equal((await mutation).status, 403);
    }

    const reserveRemoved = await request(app)
      .post(`/internal/products/${product.id}/reservations`)
      .set("x-internal-token", process.env.INTERNAL_SERVICE_TOKEN)
      .send({ buyerId: "moderation-buyer" });
    assert.equal(reserveRemoved.status, 409);

    // Commerce lifecycle updates may continue internally, but moderation is
    // an independent overlay and must keep every public surface closed.
    const lifecycleUpdate = await request(app)
      .patch(`/${product.id}/internal-status`)
      .set("x-internal-token", process.env.INTERNAL_SERVICE_TOKEN)
      .send({ status: "sold" });
    assert.equal(lifecycleUpdate.status, 200);
    assert.equal(lifecycleUpdate.body.status, "removed");
    assert.equal(lifecycleUpdate.body.commerceStatus, "sold");
    assert.equal((await request(app).get(`/${product.id}`)).status, 404);

    // Exact replay returns the original result and does not mutate twice.
    const duplicateRes = await request(app)
      .post(`/internal/moderation/${product.id}/remove`)
      .set({
        "x-internal-token": process.env.INTERNAL_SERVICE_TOKEN,
        "x-idempotency-key": removeKey,
      })
      .send({ reason: "counterfeit listing" });
    assert.equal(duplicateRes.status, 200);
    assert.equal(duplicateRes.body.preRemovalStatus, "available");

    // A new operation cannot remove an already-removed product.
    const secondOperationRes = await request(app)
      .post(`/internal/moderation/${product.id}/remove`)
      .set({
        "x-internal-token": process.env.INTERNAL_SERVICE_TOKEN,
        "x-idempotency-key": `${removeKey}-different`,
      })
      .send({ reason: "counterfeit listing" });
    assert.equal(secondOperationRes.status, 409);

    // Restore uses the current commerce state, not the stale pre-removal
    // snapshot. This product became sold while moderated, so it stays sold.
    const restoreRes = await request(app)
      .post(`/internal/moderation/${product.id}/restore`)
      .set({
        "x-internal-token": process.env.INTERNAL_SERVICE_TOKEN,
        "x-idempotency-key": restoreKey,
      })
      .send({ reason: "manual review cleared the listing" });
    assert.equal(restoreRes.status, 200);
    assert.equal(restoreRes.body.status, "sold");
    assert.equal(restoreRes.body.preRemovalStatus, null);

    const afterRestoreRes = await request(app).get("/feed");
    assert.equal(
      afterRestoreRes.body.items.some((p) => p.id === product.id),
      false,
    );
    assert.equal((await request(app).get(`/${product.id}`)).status, 200);

    const concurrentRemovals = await Promise.all([
      request(app)
        .post(`/internal/moderation/${product.id}/remove`)
        .set({
          "x-internal-token": process.env.INTERNAL_SERVICE_TOKEN,
          "x-idempotency-key": `${removeKey}-race-a`,
        })
        .send({ reason: "concurrent moderation" }),
      request(app)
        .post(`/internal/moderation/${product.id}/remove`)
        .set({
          "x-internal-token": process.env.INTERNAL_SERVICE_TOKEN,
          "x-idempotency-key": `${removeKey}-race-b`,
        })
        .send({ reason: "concurrent moderation" }),
    ]);
    assert.deepEqual(
      concurrentRemovals.map((res) => res.status).sort(),
      [200, 409],
    );
    assert.equal(
      await prisma.productModerationCommand.count({
        where: { productId: product.id, action: "REMOVE_PRODUCT" },
      }),
      2,
    );

    // An already-reserved product cannot complete checkout after moderation.
    // Releasing that hold still updates the commerce state underneath the
    // overlay, and restore then returns it to the now-correct available state.
    reservedProduct = await prisma.product.create({
      data: {
        sellerId: "int-test-seller",
        title: `${TEST_TITLE_PREFIX}reserved item`,
        price: 700,
        category: "misc",
        status: "available",
      },
    });
    const reservation = await request(app)
      .post(`/internal/products/${reservedProduct.id}/reservations`)
      .set("x-internal-token", process.env.INTERNAL_SERVICE_TOKEN)
      .send({ buyerId: "moderation-buyer" });
    assert.equal(reservation.status, 201);

    const reservedRemoveKey = `remove-${reservedProduct.id}`;
    const reservedRemove = await request(app)
      .post(`/internal/moderation/${reservedProduct.id}/remove`)
      .set({
        "x-internal-token": process.env.INTERNAL_SERVICE_TOKEN,
        "x-idempotency-key": reservedRemoveKey,
      })
      .send({ reason: "reserved listing safety review" });
    assert.equal(reservedRemove.status, 200);
    assert.equal(reservedRemove.body.status, "removed");
    assert.equal(reservedRemove.body.commerceStatus, "reserved");

    const blockedCompletion = await request(app)
      .patch(
        `/internal/products/${reservedProduct.id}/reservations/${reservation.body.reservationId}/complete`,
      )
      .set("x-internal-token", process.env.INTERNAL_SERVICE_TOKEN);
    assert.equal(blockedCompletion.status, 409);

    const release = await request(app)
      .delete(
        `/internal/products/${reservedProduct.id}/reservations/${reservation.body.reservationId}`,
      )
      .set("x-internal-token", process.env.INTERNAL_SERVICE_TOKEN);
    assert.equal(release.status, 204);
    const stillModerated = await prisma.product.findUnique({
      where: { id: reservedProduct.id },
    });
    assert.equal(stillModerated.status, "available");
    assert.ok(stillModerated.moderatedAt);
    assert.equal(
      (await request(app).get(`/${reservedProduct.id}`)).status,
      404,
    );

    const reservedRestore = await request(app)
      .post(`/internal/moderation/${reservedProduct.id}/restore`)
      .set({
        "x-internal-token": process.env.INTERNAL_SERVICE_TOKEN,
        "x-idempotency-key": `restore-${reservedProduct.id}`,
      })
      .send({ reason: "review cleared after reservation release" });
    assert.equal(reservedRestore.status, 200);
    assert.equal(reservedRestore.body.status, "available");
    assert.ok(
      (await request(app).get("/feed")).body.items.some(
        (p) => p.id === reservedProduct.id,
      ),
    );

    // Auction winners are represented as reserved without a cart reservation
    // id. Restore must keep that state while the winning Order exists instead
    // of incorrectly reopening the listing as available.
    auctionWinnerProduct = await prisma.product.create({
      data: {
        sellerId: "int-test-seller",
        title: `${TEST_TITLE_PREFIX}auction winner`,
        price: 900,
        category: "misc",
        status: "reserved",
        auction: {
          create: {
            sellerId: "int-test-seller",
            status: "closed",
            startingPrice: 500,
            bidIncrement: 50,
            winningOrderId: "auction-order-pending-payment",
          },
        },
      },
    });
    const winnerRemove = await request(app)
      .post(`/internal/moderation/${auctionWinnerProduct.id}/remove`)
      .set({
        "x-internal-token": process.env.INTERNAL_SERVICE_TOKEN,
        "x-idempotency-key": `remove-${auctionWinnerProduct.id}`,
      })
      .send({ reason: "review auction winner" });
    assert.equal(winnerRemove.status, 200);
    assert.equal(winnerRemove.body.commerceStatus, "reserved");

    const winnerRestore = await request(app)
      .post(`/internal/moderation/${auctionWinnerProduct.id}/restore`)
      .set({
        "x-internal-token": process.env.INTERNAL_SERVICE_TOKEN,
        "x-idempotency-key": `restore-${auctionWinnerProduct.id}`,
      })
      .send({ reason: "auction winner cleared" });
    assert.equal(winnerRestore.status, 200);
    assert.equal(winnerRestore.body.status, "reserved");
    assert.equal(
      (await request(app).get("/feed")).body.items.some(
        (p) => p.id === auctionWinnerProduct.id,
      ),
      false,
    );
  } finally {
    await prisma.product.deleteMany({
      where: {
        id: {
          in: [
            product.id,
            reservedProduct?.id,
            auctionWinnerProduct?.id,
          ].filter(Boolean),
        },
      },
    });
    await prisma.$disconnect();
  }
});
