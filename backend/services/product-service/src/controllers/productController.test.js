const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");
const controller = require("./productController");
const model = require("../models/productModel");
const prisma = require("../models/prismaClient");

function mockDelegate(t, delegate, method, implementation) {
  const descriptor = Object.getOwnPropertyDescriptor(delegate, method);
  Object.defineProperty(delegate, method, {
    configurable: true,
    value: t.mock.fn(implementation),
  });
  t.after(() => {
    if (descriptor) Object.defineProperty(delegate, method, descriptor);
    else delete delegate[method];
  });
}

function deletionFixture(t, product, deleteCount = 1) {
  t.mock.method(model, "findById", async () => product);
  const deletions = [];
  mockDelegate(t, prisma.product, "delete", async (args) => {
    deletions.push(args);
    return product;
  });
  mockDelegate(t, prisma.product, "deleteMany", async (args) => {
    deletions.push(args);
    return { count: deleteCount };
  });
  const app = express();
  app.delete("/:id", (req, res, next) => {
    req.userId = "seller";
    controller.remove(req, res, next);
  });
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    res.status(err.status || 500).json({ error: err.message });
  });
  return { app, deletions };
}

for (const product of [
  { id: "p", sellerId: "seller", status: "reserved" },
  {
    id: "p",
    sellerId: "seller",
    status: "hidden",
    preRemovalStatus: "reserved",
  },
]) {
  test(`TC18: ${product.status} reserved listing cannot be deleted through the API`, async (t) => {
    const { app, deletions } = deletionFixture(t, product);
    const res = await request(app).delete("/p");
    assert.equal(res.status, 409);
    assert.equal(
      res.body.error,
      "ไม่สามารถลบสินค้าที่อยู่ระหว่างการสั่งซื้อได้",
    );
    assert.equal(deletions.length, 0);
  });
}

test("TC18: deletion is guarded atomically if a reservation wins the race", async (t) => {
  const { app, deletions } = deletionFixture(
    t,
    { id: "p", sellerId: "seller", status: "available" },
    0,
  );
  const res = await request(app).delete("/p");
  assert.equal(res.status, 409);
  assert.equal(deletions.length, 1);
  assert.deepEqual(deletions[0].where, {
    id: "p",
    sellerId: "seller",
    status: { notIn: ["reserved", "auction"] },
    OR: [
      { status: { not: "hidden" } },
      { preRemovalStatus: null },
      { preRemovalStatus: { not: "reserved" } },
    ],
  });
});

test("seller can still delete an available listing", async (t) => {
  const { app, deletions } = deletionFixture(t, {
    id: "p",
    sellerId: "seller",
    status: "available",
  });
  const res = await request(app).delete("/p");
  assert.equal(res.status, 204);
  assert.equal(deletions.length, 1);
  assert.equal(prisma.product.delete.mock.callCount(), 0);
});

test("non-owner still cannot delete a listing", async (t) => {
  const { app, deletions } = deletionFixture(t, {
    id: "p",
    sellerId: "another-seller",
    status: "available",
  });
  const res = await request(app).delete("/p");
  assert.equal(res.status, 403);
  assert.equal(deletions.length, 0);
});

test("auction deletion remains forbidden", async (t) => {
  const { app, deletions } = deletionFixture(t, {
    id: "p",
    sellerId: "seller",
    status: "auction",
  });
  const res = await request(app).delete("/p");
  assert.equal(res.status, 403);
  assert.equal(deletions.length, 0);
});
