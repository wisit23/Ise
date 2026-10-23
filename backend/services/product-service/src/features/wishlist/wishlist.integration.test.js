const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
if (process.env.DATABASE_URL_PRODUCT)
  process.env.DATABASE_URL = process.env.DATABASE_URL_PRODUCT;
const db = require("../../models/prismaClient");
const { createWishlistService } = require("./wishlistService");

test("favorites persist uniquely, belong to the buyer, and count each buyer once", async (t) => {
  if (!process.env.DATABASE_URL) {
    if (process.env.REQUIRE_INTEGRATION === "1")
      throw new Error("DATABASE_URL is required");
    t.skip("DATABASE_URL is unset");
    return;
  }
  const id = `wishlist-test-${randomUUID()}`;
  const buyerA = `${id}-a`;
  const buyerB = `${id}-b`;
  const service = createWishlistService(db);
  try {
    await db.condition.create({
      data: { value: id, label: "Test", sortOrder: 999 },
    });
    await db.product.create({
      data: {
        id,
        sellerId: id,
        title: "Wishlist regression fixture",
        price: 100,
        category: id,
        condition: id,
        tags: [],
      },
    });
    assert.deepEqual(await service.read(buyerA, id), {
      saved: false,
      count: 0,
    });
    await Promise.all([service.save(buyerA, id), service.save(buyerA, id)]);
    assert.deepEqual(await service.read(buyerA, id), {
      saved: true,
      count: 1,
    });
    assert.deepEqual(await service.read(buyerB, id), {
      saved: false,
      count: 1,
    });
    assert.equal((await service.list(buyerB, { skip: 0, take: 12 })).total, 0);
    await service.save(buyerB, id);
    assert.equal(
      (await service.list(buyerA, { skip: 0, take: 12 })).items[0].id,
      id,
    );
    assert.deepEqual(await service.remove(buyerA, id), {
      saved: false,
      count: 1,
    });
    assert.deepEqual(await service.remove(buyerA, id), {
      saved: false,
      count: 1,
    });
    assert.deepEqual(await service.read(buyerB, id), {
      saved: true,
      count: 1,
    });
    await db.product.update({ where: { id }, data: { status: "hidden" } });
    await assert.rejects(
      service.save(buyerA, id),
      (error) => error.status === 404,
    );
    assert.equal((await service.list(buyerB, { skip: 0, take: 12 })).total, 0);
    await db.product.update({
      where: { id },
      data: { status: "available", moderatedAt: new Date() },
    });
    await assert.rejects(
      service.read(buyerB, id),
      (error) => error.status === 404,
    );
    assert.equal((await service.list(buyerB, { skip: 0, take: 12 })).total, 0);
  } finally {
    await db.product.deleteMany({ where: { id } });
    await db.condition.deleteMany({ where: { value: id } });
    await db.category.deleteMany({ where: { name: id } });
    await db.$disconnect();
  }
});
