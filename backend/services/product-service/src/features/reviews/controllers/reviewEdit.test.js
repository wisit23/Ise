const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");
process.env.JWT_ACCESS_SECRET ||= "review-edit-test-secret";
const { signAccessToken, errorHandler } = require("@reloop/shared");
const routes = require("../routes/reviewRoutes");
const reviews = require("../models/reviewModel");

function fixture(t, { missing = false } = {}) {
  let stored = {
    id: "review-1", orderId: "order-1", buyerId: "buyer", sellerId: "seller", productId: "product",
    rating: 4, comment: "รีวิวเดิม", media: [{ url: "/review-uploads/old.jpg", type: "image" }],
  };
  t.mock.method(reviews, "findById", async () => missing ? null : stored);
  t.mock.method(reviews, "update", async (id, buyerId, fields) => {
    assert.equal(id, "review-1");
    assert.equal(buyerId, "buyer");
    stored = { ...stored, ...fields };
    return stored;
  });
  t.mock.method(reviews, "listBySeller", async () => ({ items: [stored], total: 1, averageRating: stored.rating }));
  const app = express();
  app.use(express.json());
  app.locals.validateAccessSession = async () => {};
  app.use("/reviews", routes);
  app.use(errorHandler);
  return app;
}
function patch(app, body, userId = "buyer") {
  return request(app).patch("/reviews/review-1")
    .set("Authorization", `Bearer ${signAccessToken({ sub: userId, role: "BUYER" })}`)
    .send(body);
}

test("author can edit score, comment and ordered media without changing identity", async (t) => {
  const app = fixture(t);
  const media = [{ url: "/review-uploads/new.mp4", type: "video" }, { url: "/review-uploads/new.jpg", type: "image" }];
  const response = await patch(app, {
    rating: 2, comment: "เปลี่ยนความคิดเห็น", media,
    buyerId: "forged", sellerId: "forged", productId: "forged", orderId: "forged",
  });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    id: "review-1", orderId: "order-1", buyerId: "buyer", sellerId: "seller", productId: "product",
    rating: 2, comment: "เปลี่ยนความคิดเห็น", media,
  });
  const publicReview = await request(app).get("/reviews/by-seller/seller");
  assert.equal(publicReview.status, 200);
  assert.equal(publicReview.body.averageRating, 2);
  assert.equal(publicReview.body.items[0].comment, "เปลี่ยนความคิดเห็น");
  assert.equal(reviews.update.mock.callCount(), 1);
});

test("omitted fields keep existing values and explicit empty media removes all attachments", async (t) => {
  const app = fixture(t);
  const response = await patch(app, { comment: "แก้เฉพาะข้อความ" });
  assert.equal(response.status, 200);
  assert.equal(response.body.rating, 4);
  assert.deepEqual(response.body.media, [{ url: "/review-uploads/old.jpg", type: "image" }]);
  const cleared = await patch(app, { comment: "", media: [] });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.comment, "");
  assert.deepEqual(cleared.body.media, []);
});

test("another buyer cannot edit the author's review", async (t) => {
  const app = fixture(t);
  assert.equal((await patch(app, { rating: 1 }, "stranger")).status, 403);
  assert.equal(reviews.update.mock.callCount(), 0);
});

test("guest cannot edit any review", async (t) => {
  const app = fixture(t);
  assert.equal((await request(app).patch("/reviews/review-1").send({ rating: 1 })).status, 401);
  assert.equal(reviews.update.mock.callCount(), 0);
});

test("missing review returns 404 without writing", async (t) => {
  const app = fixture(t, { missing: true });
  assert.equal((await patch(app, { rating: 1 })).status, 404);
  assert.equal(reviews.update.mock.callCount(), 0);
});

for (const body of [
  { rating: 0 }, { rating: 6 }, { rating: 2.5 }, { rating: "5" },
  { comment: 123 }, { comment: "เหี้ย" }, { comment: "เห\u200Bี้ย" },
  { media: null }, { media: "not-array" }, { media: [{}] },
  { media: [{ url: "https://example.com/image.jpg" }] },
  { media: Array.from({ length: 9 }, () => ({ url: "/review-uploads/a.jpg" })) },
]) {
  test(`edit rejects invalid fields ${JSON.stringify(body).slice(0, 95)}`, async (t) => {
    const app = fixture(t);
    assert.equal((await patch(app, body)).status, 400);
    assert.equal(reviews.update.mock.callCount(), 0);
  });
}
