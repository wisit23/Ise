const test = require("node:test");
const assert = require("node:assert/strict");

const repository = require("./productVideoRepository");
const service = require("./productVideoService");
const chatClient = require("../auctions/chatClient");

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

test("createClip rejects a product under Trust & Safety moderation", async (t) => {
  t.mock.method(repository, "findProductOwner", async () => ({
    id: "product-1",
    sellerId: "seller-1",
    status: "available",
    moderatedAt: new Date(),
  }));

  await assert.rejects(
    service.createClip({
      user: { id: "seller-1", role: "SELLER" },
      input: { videoUrl: "/uploads/a.mp4", productId: "product-1" },
    }),
    (err) =>
      err.status === 403 &&
      err.message === "cannot attach a video to a moderated product",
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

test("chooseClip hides a card whose product is moderated", async (t) => {
  t.mock.method(repository, "findById", async () => ({
    id: "video-1",
    product: { status: "available", moderatedAt: new Date() },
  }));

  await assert.rejects(
    service.chooseClip({
      user: { id: "user-1", role: "BUYER" },
      productVideoId: "video-1",
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

test("chooseClip rejects non-buyer roles (MARKETING, ADMIN) with 403", async () => {
  for (const role of ["MARKETING", "ADMIN", "SUPPORT"]) {
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
    user: { id: "user-buyer-multi", roles: ["BUYER", "SELLER"] },
    productVideoId: "video-1",
  });

  assert.equal(result.chosen, true);
  assert.equal(result.userId, "user-buyer-multi");
});

test("unchooseClip rejects non-buyer roles (MARKETING, ADMIN) with 403", async () => {
  for (const role of ["MARKETING", "ADMIN", "SUPPORT"]) {
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

test("createClip rejects a sold product with 400 badRequest", async (t) => {
  t.mock.method(repository, "findProductOwner", async () => ({
    id: "product-sold",
    sellerId: "seller-1",
    status: "sold",
  }));

  await assert.rejects(
    service.createClip({
      user: { id: "seller-1", role: "SELLER" },
      input: { videoUrl: "/uploads/a.mp4", productId: "product-sold" },
    }),
    (err) =>
      err.status === 400 &&
      err.message === "cannot attach a video to a sold product",
  );
});

test("chooseClip notifies the seller if another user liked their clip", async (t) => {
  t.mock.method(repository, "findById", async (id) => ({
    id,
    sellerId: "seller-10",
    productId: "product-10",
    product: { title: "Super Shirt", status: "available" },
  }));
  t.mock.method(repository, "upsertChoice", async (args) => args);

  let notifiedArgs = null;
  t.mock.method(chatClient, "sendSystemNotification", async (args) => {
    notifiedArgs = args;
    return { ok: true };
  });

  const res = await service.chooseClip({
    user: { id: "buyer-99", role: "BUYER", displayName: "Happy Buyer" },
    productVideoId: "video-10",
  });

  assert.equal(res.chosen, true);
  assert.ok(notifiedArgs);
  assert.equal(notifiedArgs.userId, "seller-10");
  assert.equal(notifiedArgs.type, "LIKE");
  assert.equal(notifiedArgs.title, "มีคนถูกใจคลิปรีวิวของคุณ");
  assert.ok(notifiedArgs.message.includes("Happy Buyer"));
  assert.ok(notifiedArgs.message.includes("Super Shirt"));
  assert.equal(notifiedArgs.link, "/swipe?videoId=video-10");
});

test("chooseClip does not notify seller when seller likes their own clip", async (t) => {
  t.mock.method(repository, "findById", async (id) => ({
    id,
    sellerId: "seller-same",
    productId: "product-10",
    product: { title: "Super Shirt", status: "available" },
  }));
  t.mock.method(repository, "upsertChoice", async (args) => args);

  let notified = false;
  t.mock.method(chatClient, "sendSystemNotification", async () => {
    notified = true;
  });

  await service.chooseClip({
    user: { id: "seller-same", role: "SELLER" },
    productVideoId: "video-10",
  });

  assert.equal(notified, false);
});

test("createComment validates input, creates comment, and notifies seller", async (t) => {
  t.mock.method(repository, "findById", async (id) => ({
    id,
    sellerId: "seller-20",
    productId: "product-20",
    product: { title: "Smart Watch", status: "available" },
  }));

  let createdData = null;
  t.mock.method(repository, "createComment", async (data) => {
    createdData = data;
    return { id: "comment-1", ...data, createdAt: new Date() };
  });

  let notifiedArgs = null;
  t.mock.method(chatClient, "sendSystemNotification", async (args) => {
    notifiedArgs = args;
    return { ok: true };
  });

  const comment = await service.createComment({
    user: { id: "buyer-1", role: "BUYER", displayName: "Tester" },
    productVideoId: "video-20",
    input: { comment: "ของดีมากครับ ส่งไวมาก!" },
  });

  assert.equal(comment.id, "comment-1");
  assert.deepEqual(createdData, {
    productVideoId: "video-20",
    userId: "buyer-1",
    userName: "Tester",
    comment: "ของดีมากครับ ส่งไวมาก!",
  });

  assert.ok(notifiedArgs);
  assert.equal(notifiedArgs.userId, "seller-20");
  assert.equal(notifiedArgs.type, "REVIEW");
  assert.equal(notifiedArgs.title, "มีความคิดเห็นใหม่บนคลิปรีวิวของคุณ");
  assert.ok(notifiedArgs.message.includes("Tester"));
  assert.ok(notifiedArgs.message.includes("Smart Watch"));
  assert.ok(notifiedArgs.message.includes("ของดีมากครับ"));
  assert.equal(notifiedArgs.link, "/swipe?videoId=video-20");
});

test("createComment rejects non-buyer or empty comment", async () => {
  await assert.rejects(
    service.createComment({
      user: { id: "admin-1", role: "ADMIN" },
      productVideoId: "video-1",
      input: { comment: "hello" },
    }),
    (err) => err.status === 403,
  );

  await assert.rejects(
    service.createComment({
      user: { id: "buyer-1", role: "BUYER" },
      productVideoId: "video-1",
      input: { comment: "" },
    }),
    (err) => err.status === 400 && err.message.includes("comment is required"),
  );
});

test("listComments returns comments from repository", async (t) => {
  t.mock.method(repository, "findById", async (id) => ({
    id,
    product: { status: "available" },
  }));
  t.mock.method(repository, "listComments", async (id) => [
    { id: "c1", productVideoId: id, comment: "great clip!" },
  ]);

  const comments = await service.listComments("video-1");
  assert.equal(comments.length, 1);
  assert.equal(comments[0].comment, "great clip!");
});
