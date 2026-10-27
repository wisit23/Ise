const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const prisma = require("../src/models/prismaClient");
const products = require("../src/models/productModel");
const clips = require("../src/features/product-videos/productVideoRepository");
const {
  createWishlistService,
} = require("../src/features/wishlist/wishlistService");
const {
  reserveProduct,
} = require("../src/features/reservations/reservationService");

test("seller deletion retains history, hides deleted rows, and blocks reuse", async (t) => {
  if (!process.env.SELLER_SOFT_DELETE_TEST_DB) {
    t.skip("Requires an isolated database prepared by the rehearsal script");
    return;
  }
  const sellerId = `soft-delete-${randomUUID()}`;
  const wishlist = createWishlistService(prisma);
  await prisma.condition.upsert({
    where: { value: "Good" },
    create: { value: "Good", label: "Good" },
    update: {},
  });
  const product = await products.create({
    sellerId,
    title: sellerId,
    price: 100,
    category: "old",
    categories: ["old", "kept"],
    tags: [],
    media: [
      { type: "image", url: "/old.jpg" },
      { type: "video", url: "/old.mp4" },
    ],
  });
  try {
    const clip = await clips.create({
      sellerId,
      productId: product.id,
      videoUrl: "/clip.mp4",
    });
    await clips.createComment({
      productVideoId: clip.id,
      userId: "buyer",
      comment: "Keep history",
    });
    await clips.upsertChoice({ productVideoId: clip.id, userId: "buyer" });
    await clips.deleteChoice({ productVideoId: clip.id, userId: "buyer" });
    assert.equal(
      await prisma.swipeChoice.count({ where: { productVideoId: clip.id } }),
      1,
    );
    assert.equal(
      (await clips.listAvailable({ userId: "buyer" })).items.find(
        (row) => row.id === clip.id,
      ).chosen,
      false,
    );
    await clips.upsertChoice({ productVideoId: clip.id, userId: "buyer" });
    assert.equal(
      await prisma.swipeChoice.count({ where: { productVideoId: clip.id } }),
      1,
    );
    assert.equal(
      (await clips.listAvailable({ userId: "buyer" })).items.find(
        (row) => row.id === clip.id,
      ).chosen,
      true,
    );

    await wishlist.save("buyer", product.id);
    await wishlist.remove("buyer", product.id);
    assert.ok(
      (
        await prisma.productFavorite.findUnique({
          where: {
            userId_productId: { userId: "buyer", productId: product.id },
          },
        })
      ).deletedAt,
    );
    assert.deepEqual(await wishlist.read("buyer", product.id), {
      saved: false,
      count: 0,
    });
    await wishlist.save("buyer", product.id);
    assert.deepEqual(await wishlist.read("buyer", product.id), {
      saved: true,
      count: 1,
    });

    await products.updateBySeller(product.id, {
      category: "new",
      categories: ["new", "kept"],
      media: [{ type: "image", url: "/new.jpg" }],
    });
    assert.equal(
      await prisma.photo.count({ where: { productId: product.id } }),
      2,
    );
    assert.equal(
      await prisma.video.count({ where: { productId: product.id } }),
      1,
    );
    assert.deepEqual((await products.findById(product.id)).media, [
      { type: "image", url: "/new.jpg" },
    ]);
    assert.deepEqual((await products.findById(product.id)).categories, [
      "kept",
      "new",
    ]);
    assert.ok(
      (
        await prisma.productCategory.findFirst({
          where: { productId: product.id, category: { name: "old" } },
        })
      ).deletedAt,
    );
    assert.equal(
      (
        await products.list({
          status: "available",
          category: "old",
          q: sellerId,
        })
      ).total,
      0,
    );
    // Re-adding the same composite key must restore it without a unique-key error.
    await products.updateBySeller(product.id, {
      category: "old",
      categories: ["old"],
    });
    assert.deepEqual((await products.findById(product.id)).categories, ["old"]);
    await products.update(product.id, { media: [] });
    assert.deepEqual((await products.findById(product.id)).media, []);
    assert.equal(
      await prisma.photo.count({ where: { productId: product.id } }),
      2,
    );

    await assert.rejects(clips.deleteOwned(clip.id, "another-seller"), {
      code: "P2025",
    });
    await clips.deleteOwned(clip.id, sellerId);
    assert.ok(
      (await prisma.productVideo.findUnique({ where: { id: clip.id } }))
        .deletedAt,
    );
    assert.equal(await clips.findById(clip.id), null);
    assert.equal((await clips.listMine({ sellerId })).total, 0);
    assert.equal(
      await prisma.productVideoComment.count({
        where: { productVideoId: clip.id },
      }),
      1,
    );
    assert.equal(
      await prisma.swipeChoice.count({ where: { productVideoId: clip.id } }),
      1,
    );
    const retainedClip = await clips.create({
      sellerId,
      productId: product.id,
      videoUrl: "/retained.mp4",
    });

    for (const status of ["reserved", "sold", "auction", "removed"]) {
      await prisma.product.update({
        where: { id: product.id },
        data: { status },
      });
      assert.equal(await products.removeBySeller(product.id, sellerId), false);
    }
    await prisma.product.update({
      where: { id: product.id },
      data: { status: "available" },
    });
    assert.equal(
      await products.removeBySeller(product.id, "another-seller"),
      false,
    );
    assert.equal(await products.removeBySeller(product.id, sellerId), true);
    assert.ok(
      (await prisma.product.findUnique({ where: { id: product.id } }))
        .deletedAt,
    );
    assert.equal(await products.findById(product.id), null);
    assert.equal(
      (await products.listBySeller(sellerId, { includeModerated: true })).total,
      0,
    );
    assert.equal(
      (await products.list({ status: "available", q: sellerId })).total,
      0,
    );
    assert.equal(
      (await wishlist.list("buyer", { skip: 0, take: 20 })).total,
      0,
    );
    assert.equal(await clips.findById(retainedClip.id), null);
    assert.equal(
      (await clips.listAvailable({ videoId: retainedClip.id })).total,
      0,
    );
    assert.equal(
      await products.updateBySeller(product.id, { title: "Revive" }),
      null,
    );
    assert.equal(await products.setVisibility(product.id, true), null);
    await assert.rejects(
      reserveProduct(product.id, "buyer"),
      (error) => error.status === 404,
    );
    assert.equal(
      await prisma.productVideo.count({ where: { productId: product.id } }),
      2,
    );
    assert.equal(
      await prisma.productFavorite.count({ where: { productId: product.id } }),
      1,
    );
  } finally {
    // Only test fixtures are purged; production paths never perform these deletes.
    await prisma.product.delete({ where: { id: product.id } });
    await prisma.$disconnect();
  }
});
