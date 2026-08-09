const test = require("node:test");
const assert = require("node:assert/strict");

const { createProductVideoRepository } = require("./productVideoRepository");

test("listAvailable queries clips for available products only", async () => {
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

  assert.deepEqual(result, { items: [{ id: "video-1" }], total: 1 });
});
