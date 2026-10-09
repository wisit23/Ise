const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");
const controller = require("./reviewController");
const reviews = require("../models/reviewModel");
const orders = require("../services/orderClient");

function fixture(t, { existing = null, status = "completed" } = {}) {
  const saved = [];
  t.mock.method(orders, "getOrder", async () => ({
    buyerId: "buyer",
    sellerId: "seller",
    productId: "p",
    status,
  }));
  t.mock.method(reviews, "findByOrderId", async () => existing);
  t.mock.method(reviews, "create", async (data) => {
    saved.push(data);
    return { id: "review-1", ...data };
  });
  const app = express();
  app.use(express.json());
  app.post("/", (req, res, next) => {
    req.userId = "buyer";
    controller.create(req, res, next);
  });
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    res.status(err.status || 500).json({ error: err.message });
  });
  return { app, saved };
}

for (const comment of [
  "ไอ้เหี้ย",
  "สัส",
  "ควย",
  "เย็ด",
  "เห\u200Bี้ย",
  "เห\u2060ี้ย",
  "ดี".repeat(1001) + "เหี้ย",
]) {
  test(`TC17: prohibited comment ${JSON.stringify(comment.slice(-12))} is rejected without saving`, async (t) => {
    const { app, saved } = fixture(t);
    const res = await request(app)
      .post("/")
      .send({ orderId: "o", rating: 1, comment });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, "พบคำไม่เหมาะสมในรีวิว กรุณาแก้ไข");
    assert.equal(saved.length, 0);
  });
}

test("a polite comment is saved unchanged with its review media", async (t) => {
  const { app, saved } = fixture(t);
  const comment = "สินค้าสำหรับสัตว์เลี้ยงตรงปก ส่งไว";
  const media = [{ url: "/review-uploads/photo.jpg", type: "image" }];
  const res = await request(app)
    .post("/")
    .send({ orderId: "o", rating: 5, comment, media });
  assert.equal(res.status, 201);
  assert.equal(saved[0].comment, comment);
  assert.deepEqual(saved[0].media, media);
});

test("TC17: editing a rejected comment to a polite comment allows retry", async (t) => {
  const { app, saved } = fixture(t);
  assert.equal(
    (
      await request(app)
        .post("/")
        .send({ orderId: "o", rating: 1, comment: "เหี้ย" })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(app)
        .post("/")
        .send({ orderId: "o", rating: 1, comment: "สินค้าไม่ตรงปก" })
    ).status,
    201,
  );
  assert.equal(saved.length, 1);
});

test("duplicate review rejection is preserved", async (t) => {
  const { app, saved } = fixture(t, { existing: { id: "existing" } });
  assert.equal(
    (
      await request(app)
        .post("/")
        .send({ orderId: "o", rating: 5, comment: "ดี" })
    ).status,
    409,
  );
  assert.equal(saved.length, 0);
});
