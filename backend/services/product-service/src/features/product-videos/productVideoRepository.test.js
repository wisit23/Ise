const test = require("node:test");
const assert = require("node:assert/strict");

const { createProductVideoRepository } = require("./productVideoRepository");

test("listAvailable queries clips for available products only and sets chosen: false for guest", async () => {
  const prisma = {
    productVideo: {
      findMany: async (query) => {
        assert.deepEqual(query.where, { product: { status: "available" } });
        assert.equal(query.skip, 20);
        assert.equal(query.take, 10);
        return [{ id: "video-1" }];
      },
      count: async (query) => {
        assert.deepEqual(query.where, { product: { status: "available" } });
        return 1;
      },
    },
  };
  const repository = createProductVideoRepository(prisma);

  const result = await repository.listAvailable({ skip: 20, take: 10 });

  assert.deepEqual(result, {
    items: [{ id: "video-1", chosen: false }],
    total: 1,
  });
});

test("listAvailable attaches chosen flag for authenticated userId and does not leak choices relation", async () => {
  const prisma = {
    productVideo: {
      findMany: async (query) => {
        assert.deepEqual(query.where, { product: { status: "available" } });
        assert.deepEqual(query.include.choices, {
          where: { userId: "buyer-42" },
          select: { id: true },
        });
        return [
          { id: "video-1", choices: [{ id: "choice-1" }] },
          { id: "video-2", choices: [] },
        ];
      },
      count: async () => 2,
    },
  };
  const repository = createProductVideoRepository(prisma);

  const result = await repository.listAvailable({
    skip: 0,
    take: 10,
    userId: "buyer-42",
  });

  assert.equal(result.total, 2);
  assert.equal(result.items.length, 2);

  // Video 1 was chosen by buyer-42
  assert.equal(result.items[0].id, "video-1");
  assert.equal(result.items[0].chosen, true);
  assert.equal(result.items[0].choices, undefined);
  assert.equal(
    Object.prototype.hasOwnProperty.call(result.items[0], "choices"),
    false,
  );

  // Video 2 was not chosen by buyer-42
  assert.equal(result.items[1].id, "video-2");
  assert.equal(result.items[1].chosen, false);
  assert.equal(result.items[1].choices, undefined);
  assert.equal(
    Object.prototype.hasOwnProperty.call(result.items[1], "choices"),
    false,
  );
});
