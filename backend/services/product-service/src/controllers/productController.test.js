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
    moderatedAt: null,
    status: { notIn: ["removed", "reserved", "auction", "sold"] },
    OR: [
      { status: { not: "hidden" } },
      { preRemovalStatus: null },
      { preRemovalStatus: { notIn: ["reserved", "sold"] } },
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

function updateFixture(t, product, updateMock = null) {
  t.mock.method(model, "findById", async () => product);
  if (updateMock) {
    t.mock.method(model, "updateBySeller", updateMock);
  }
  const app = express();
  app.use(express.json());
  app.patch("/:id", (req, res, next) => {
    req.userId = "seller";
    controller.update(req, res, next);
  });
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    res.status(err.status || 500).json({ error: err.message });
  });
  return app;
}

for (const product of [
  { id: "p", sellerId: "seller", status: "sold" },
  { id: "p", sellerId: "seller", status: "hidden", preRemovalStatus: "sold" },
]) {
  test(`${product.status} sold listing cannot be deleted`, async (t) => {
    const { app, deletions } = deletionFixture(t, product);
    const res = await request(app).delete("/p");
    assert.equal(res.status, 409);
    assert.equal(res.body.error, "ไม่สามารถลบสินค้าที่ขายแล้วได้");
    assert.equal(deletions.length, 0);
  });

  test(`${product.status} sold listing cannot be edited or made available`, async (t) => {
    const update = t.mock.fn();
    const app = updateFixture(t, product, update);
    for (const patch of [{ title: "Changed" }, { price: 200 }, { status: "available" }, { media: [] }]) {
      const res = await request(app).patch("/p").send(patch);
      assert.equal(res.status, 409);
      assert.equal(res.body.error, "ไม่สามารถแก้ไขสินค้าที่ขายแล้วได้");
    }
    assert.equal(update.mock.callCount(), 0);
  });

  test(`${product.status} sold listing visibility cannot change`, async (t) => {
    t.mock.method(model, "findById", async () => product);
    const visibility = t.mock.method(model, "setVisibility", async () => product);
    for (const visible of [true, false]) {
      let error;
      await controller.toggleVisibility(
        { params: { id: "p" }, userId: "seller", body: { visible } },
        {},
        (err) => { error = err; },
      );
      assert.equal(error.status, 409);
    }
    assert.equal(visibility.mock.callCount(), 0);
  });

  test(`${product.status} sold listing cannot bypass the lock via visibility in the model`, async (t) => {
    mockDelegate(t, prisma.product, "findUnique", async () => product);
    mockDelegate(t, prisma.product, "updateMany", async () => ({ count: 1 }));
    for (const visible of [true, false]) {
      const result = await model.setVisibility("p", visible);
      assert.equal(result.status, product.status);
    }
    assert.equal(prisma.product.updateMany.mock.callCount(), 0);
  });
}

test("a sale winning the edit race leaves media and categories untouched", async (t) => {
  mockDelegate(t, prisma.product, "updateMany", async () => ({ count: 0 }));
  const photos = t.mock.fn();
  const videos = t.mock.fn();
  mockDelegate(t, prisma.photo, "deleteMany", photos);
  mockDelegate(t, prisma.video, "deleteMany", videos);
  t.mock.method(prisma, "$transaction", async (fn) => fn(prisma));
  assert.equal(await model.updateBySeller("p", { title: "Changed", media: [] }), null);
  assert.equal(photos.mock.callCount(), 0);
  assert.equal(videos.mock.callCount(), 0);
});

test("reserved listing cannot have its price changed through the update API", async (t) => {
  const app = updateFixture(t, {
    id: "p",
    sellerId: "seller",
    status: "reserved",
    price: 100,
  });
  const res = await request(app).patch("/p").send({ price: 200 });
  assert.equal(res.status, 409);
  assert.equal(
    res.body.error,
    "ไม่สามารถเปลี่ยนราคาสินค้าที่อยู่ระหว่างการสั่งซื้อได้",
  );
});

test("reserved listing cannot be edited through the update API even if price is unchanged", async (t) => {
  const app = updateFixture(t, {
    id: "p",
    sellerId: "seller",
    status: "reserved",
    price: 100,
  });
  const res = await request(app)
    .patch("/p")
    .send({ title: "New title", price: 100 });
  assert.equal(res.status, 409);
  assert.equal(
    res.body.error,
    "ไม่สามารถแก้ไขสินค้าที่อยู่ระหว่างการสั่งซื้อได้",
  );
});

// Direct PATCH tests with invalid and valid prices
test("PATCH with price 0 responds with 400 and Thai error message", async (t) => {
  const app = updateFixture(t, {
    id: "p",
    sellerId: "seller",
    status: "available",
    price: 100,
  });
  const res = await request(app).patch("/p").send({ price: 0 });
  assert.equal(res.status, 400);
  assert.equal(
    res.body.error,
    "ราคาต้องเป็นตัวเลขจำนวนเต็มมากกว่า 0 และไม่เกิน 2,147,483,647 บาท",
  );
});

test("PATCH with negative price responds with 400 and Thai error message", async (t) => {
  const app = updateFixture(t, {
    id: "p",
    sellerId: "seller",
    status: "available",
    price: 100,
  });
  const res = await request(app).patch("/p").send({ price: -50 });
  assert.equal(res.status, 400);
  assert.equal(
    res.body.error,
    "ราคาต้องเป็นตัวเลขจำนวนเต็มมากกว่า 0 และไม่เกิน 2,147,483,647 บาท",
  );
});

test("PATCH with decimal price responds with 400 and Thai error message", async (t) => {
  const app = updateFixture(t, {
    id: "p",
    sellerId: "seller",
    status: "available",
    price: 100,
  });
  const res = await request(app).patch("/p").send({ price: 99.99 });
  assert.equal(res.status, 400);
  assert.equal(
    res.body.error,
    "ราคาต้องเป็นตัวเลขจำนวนเต็มมากกว่า 0 และไม่เกิน 2,147,483,647 บาท",
  );
});

test("PATCH with text price responds with 400 and Thai error message", async (t) => {
  const app = updateFixture(t, {
    id: "p",
    sellerId: "seller",
    status: "available",
    price: 100,
  });
  const res = await request(app).patch("/p").send({ price: "invalid-price" });
  assert.equal(res.status, 400);
  assert.equal(
    res.body.error,
    "ราคาต้องเป็นตัวเลขจำนวนเต็มมากกว่า 0 และไม่เกิน 2,147,483,647 บาท",
  );
});

test("PATCH with valid price responds with 200 and updates product", async (t) => {
  let patchApplied = null;
  const app = updateFixture(
    t,
    { id: "p", sellerId: "seller", status: "available", price: 100 },
    async (id, patch) => {
      patchApplied = patch;
      return { id: "p", sellerId: "seller", status: "available", ...patch };
    },
  );
  const res = await request(app).patch("/p").send({ price: 250 });
  assert.equal(res.status, 200);
  assert.equal(res.body.price, 250);
  assert.equal(patchApplied.price, 250);
});

test("PATCH updating details without sending price succeeds and preserves price", async (t) => {
  let patchApplied = null;
  const app = updateFixture(
    t,
    {
      id: "p",
      sellerId: "seller",
      status: "available",
      price: 100,
      description: "Old description",
    },
    async (id, patch) => {
      patchApplied = patch;
      return {
        id: "p",
        sellerId: "seller",
        status: "available",
        price: 100,
        ...patch,
      };
    },
  );
  const res = await request(app)
    .patch("/p")
    .send({ description: "New description" });
  assert.equal(res.status, 200);
  assert.equal(res.body.description, "New description");
  assert.equal(res.body.price, 100);
  assert.equal(patchApplied.price, undefined);
  assert.equal(patchApplied.description, "New description");
});

test("TC18: update is guarded atomically if a reservation wins the race", async (t) => {
  const app = updateFixture(
    t,
    { id: "p", sellerId: "seller", status: "available", price: 100 },
    async () => null,
  );
  const res = await request(app).patch("/p").send({ price: 250 });
  assert.equal(res.status, 409);
  assert.equal(
    res.body.error,
    "listing changed, was reserved or was moderated; reload before editing",
  );
});

test("updateBySeller verifies product is not reserved, auction or removed before updating", async (t) => {
  const updates = [];
  mockDelegate(t, prisma.product, "updateMany", async (args) => {
    updates.push(args);
    return { count: 1 };
  });
  mockDelegate(t, prisma.product, "findUnique", async () => ({
    id: "p",
    sellerId: "seller",
    status: "available",
  }));
  t.mock.method(prisma, "$transaction", async (fn) => fn(prisma));

  await model.updateBySeller("p", { price: 200 });
  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0].where, {
    id: "p",
    moderatedAt: null,
    status: { notIn: ["removed", "reserved", "auction", "sold"] },
    OR: [
      { status: { not: "hidden" } },
      { preRemovalStatus: null },
      { preRemovalStatus: { notIn: ["reserved", "sold"] } },
    ],
  });
});
