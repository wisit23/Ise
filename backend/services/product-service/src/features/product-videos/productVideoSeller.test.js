const test = require("node:test");
const assert = require("node:assert/strict");
const repository = require("./productVideoRepository");
const service = require("./productVideoService");
const { createProductVideoRepository } = repository;
const user = { id: "seller-1", role: "SELLER" };

test("seller list scopes both clip and unsold product to authenticated seller, newest first", async () => {
  let query;
  const repo = createProductVideoRepository({
    productVideo: {
      findMany: async (input) => {
        query = input;
        return [{ id: "clip-1" }];
      },
      count: async ({ where }) => {
        assert.equal(where.sellerId, user.id);
        return 1;
      },
    },
  });
  const result = await repo.listMine({ sellerId: user.id, skip: 12, take: 12 });
  assert.deepEqual(query.where, {
    sellerId: user.id,
    product: { sellerId: user.id, status: { not: "sold" } },
  });
  assert.deepEqual(query.orderBy, [{ createdAt: "desc" }, { id: "desc" }]);
  assert.equal(query.skip, 12);
  assert.equal(result.total, 1);
});

test("listMine rejects buyers and uses the authenticated seller id", async (t) => {
  assert.throws(
    () => service.listMine({ user: { id: "buyer", role: "BUYER" } }),
    (err) => err.status === 403,
  );
  t.mock.method(repository, "listMine", async (args) => {
    assert.deepEqual(args, { sellerId: user.id, skip: 0, take: 12 });
    return { items: [], total: 0 };
  });
  await service.listMine({ user, skip: 0, take: 12, sellerId: "another" });
});

test("edit and delete reject another seller's clip", async (t) => {
  t.mock.method(repository, "findById", async () => ({
    id: "clip-1",
    sellerId: "other",
  }));
  for (const action of [service.updateClip, service.deleteClip]) {
    await assert.rejects(
      action({ user, id: "clip-1", input: { title: "hijacked" } }),
      (err) => err.status === 404,
    );
  }
});

test("edit rejects another seller's product, sold products and moderated products", async (t) => {
  t.mock.method(repository, "findById", async () => ({
    id: "clip-1",
    sellerId: user.id,
    productId: "old",
  }));
  for (const product of [
    { sellerId: "other", status: "available" },
    { sellerId: user.id, status: "sold" },
    { sellerId: user.id, status: "available", moderatedAt: new Date() },
  ]) {
    const mock = t.mock.method(
      repository,
      "findProductOwner",
      async () => product,
    );
    await assert.rejects(
      service.updateClip({ user, id: "clip-1", input: { productId: "new" } }),
      (err) => [400, 403].includes(err.status),
    );
    mock.mock.restore();
  }
});

test("edit whitelists fields and permits reserved unsold products", async (t) => {
  t.mock.method(repository, "findById", async () => ({
    id: "clip-1",
    sellerId: user.id,
    productId: "old",
  }));
  t.mock.method(repository, "findProductOwner", async () => ({
    sellerId: user.id,
    status: "reserved",
  }));
  t.mock.method(repository, "updateOwned", async (id, sellerId, data) => {
    assert.equal(id, "clip-1");
    assert.equal(sellerId, user.id);
    assert.deepEqual(data, {
      title: "new title",
      description: "description",
      videoUrl: "/uploads/new.mp4",
      productId: "new",
    });
    return { id, ...data };
  });
  await service.updateClip({
    user,
    id: "clip-1",
    input: {
      title: " new title ",
      description: "description",
      videoUrl: "/uploads/new.mp4",
      productId: "new",
      sellerId: "other",
    },
  });
});

test("delete passes ownership constraint to the repository", async (t) => {
  t.mock.method(repository, "findById", async () => ({
    id: "clip-1",
    sellerId: user.id,
  }));
  t.mock.method(repository, "deleteOwned", async (id, sellerId) => {
    assert.equal(id, "clip-1");
    assert.equal(sellerId, user.id);
  });
  assert.deepEqual(await service.deleteClip({ user, id: "clip-1" }), {
    success: true,
  });
});
