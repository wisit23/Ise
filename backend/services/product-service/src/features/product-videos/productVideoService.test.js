const test = require("node:test");
const assert = require("node:assert/strict");

const repository = require("./productVideoRepository");
const service = require("./productVideoService");

test("listFeed delegates pagination to the available-product query", async (t) => {
  t.mock.method(repository, "listAvailable", async (pagination) => {
    assert.deepEqual(pagination, { skip: 10, take: 5 });
    return { items: [{ id: "video-1" }], total: 1 };
  });

  const result = await service.listFeed({ skip: 10, take: 5 });

  assert.equal(result.total, 1);
  assert.equal(result.items[0].id, "video-1");
});

test("createClip rejects a buyer before querying the database", async () => {
  await assert.rejects(
    service.createClip({
      user: { id: "buyer-1", role: "BUYER" },
      input: { videoUrl: "/uploads/a.mp4", productId: "product-1" },
    }),
    (err) => err.status === 403,
  );
});

test("createClip reports missing required fields as a bad request", async () => {
  await assert.rejects(
    service.createClip({
      user: { id: "seller-1", role: "SELLER" },
      input: {},
    }),
    (err) => err.status === 400 && err.message === "videoUrl is required",
  );
});

test("createClip rejects a product owned by another seller", async (t) => {
  t.mock.method(repository, "findProductOwner", async () => ({
    id: "product-1",
    sellerId: "seller-2",
  }));

  await assert.rejects(
    service.createClip({
      user: { id: "seller-1", role: "SELLER" },
      input: { videoUrl: "/uploads/a.mp4", productId: "product-1" },
    }),
    (err) => err.status === 403,
  );
});

test("createClip stores the verified token name and ignores a body sellerName", async (t) => {
  t.mock.method(repository, "findProductOwner", async () => ({
    id: "product-1",
    sellerId: "seller-1",
  }));
  t.mock.method(repository, "create", async (data) => ({
    id: "video-1",
    ...data,
  }));

  const clip = await service.createClip({
    user: {
      id: "seller-1",
      role: "SELLER",
      displayName: "Trusted Seller",
    },
    input: {
      videoUrl: " /uploads/a.mp4 ",
      productId: "product-1",
      description: " Demo clip ",
      sellerName: "Spoofed Name",
    },
  });

  assert.equal(clip.sellerName, "Trusted Seller");
  assert.equal(clip.videoUrl, "/uploads/a.mp4");
  assert.equal(clip.description, "Demo clip");
});

test("chooseClip rejects a non-existent card", async (t) => {
  t.mock.method(repository, "findById", async () => null);

  await assert.rejects(
    service.chooseClip({
      user: { id: "user-1", role: "BUYER" },
      productVideoId: "missing-card",
    }),
    (err) => err.status === 404,
  );
});

test("chooseClip upserts a choice for the user", async (t) => {
  t.mock.method(repository, "findById", async (id) => ({ id }));
  t.mock.method(
    repository,
    "upsertChoice",
    async ({ productVideoId, userId }) => ({
      productVideoId,
      userId,
    }),
  );

  const result = await service.chooseClip({
    user: { id: "user-1", role: "BUYER" },
    productVideoId: "video-1",
  });

  assert.equal(result.productVideoId, "video-1");
  assert.equal(result.userId, "user-1");
  assert.equal(result.chosen, true);
});

test("chooseClip rejects non-buyer roles (SELLER, MARKETING, ADMIN) with 403", async () => {
  for (const role of ["SELLER", "MARKETING", "ADMIN", "SUPPORT"]) {
    await assert.rejects(
      service.chooseClip({
        user: { id: "user-1", role },
        productVideoId: "video-1",
      }),
      (err) => err.status === 403,
    );
  }
});

test("chooseClip accepts user when roles array contains BUYER", async (t) => {
  t.mock.method(repository, "findById", async (id) => ({ id }));
  t.mock.method(
    repository,
    "upsertChoice",
    async ({ productVideoId, userId }) => ({
      productVideoId,
      userId,
    }),
  );

  const result = await service.chooseClip({
    user: { id: "user-buyer-multi", roles: ["BUYER", "REVIEWER"] },
    productVideoId: "video-1",
  });

  assert.equal(result.chosen, true);
  assert.equal(result.userId, "user-buyer-multi");
});

test("unchooseClip rejects non-buyer roles (SELLER, MARKETING, ADMIN) with 403", async () => {
  for (const role of ["SELLER", "MARKETING", "ADMIN", "SUPPORT"]) {
    await assert.rejects(
      service.unchooseClip({
        user: { id: "user-1", role },
        productVideoId: "video-1",
      }),
      (err) => err.status === 403,
    );
  }
});

test("unchooseClip deletes the choice and returns chosen: false", async (t) => {
  t.mock.method(repository, "findById", async (id) => ({ id }));
  let deletedArgs = null;
  t.mock.method(repository, "deleteChoice", async (args) => {
    deletedArgs = args;
    return { count: 1 };
  });

  const result = await service.unchooseClip({
    user: { id: "user-1", role: "BUYER" },
    productVideoId: "video-1",
  });

  assert.deepEqual(deletedArgs, {
    productVideoId: "video-1",
    userId: "user-1",
  });
  assert.equal(result.chosen, false);
});

test("listFeed passes userId to repository when provided", async (t) => {
  let passedArgs = null;
  t.mock.method(repository, "listAvailable", async (args) => {
    passedArgs = args;
    return { items: [{ id: "video-1", chosen: true }], total: 1 };
  });

  const result = await service.listFeed({
    skip: 0,
    take: 10,
    userId: "buyer-123",
  });

  assert.deepEqual(passedArgs, { skip: 0, take: 10, userId: "buyer-123" });
  assert.equal(result.items[0].chosen, true);
});
