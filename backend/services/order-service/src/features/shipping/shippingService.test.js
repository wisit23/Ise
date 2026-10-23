const test = require("node:test");
const assert = require("node:assert/strict");
const { createShippingService, normalizeAddress } = require("./shippingService");

const ADDRESS = {
  recipientName: "Buyer",
  phone: "0812345678",
  addressLine: "99 Main Road",
  subdistrict: "A",
  district: "B",
  province: "Bangkok",
  postalCode: "10110",
};

for (const trackingNumber of ["LETTERS", "พัสดุ", "AB 123", "AB-123", "123!", "A".repeat(121) + "1"]) {
  test(`invalid tracking number ${trackingNumber} is rejected before any write`, async () => {
    const { service, writes } = fixture({ status: "ready_to_ship" });
    await assert.rejects(service.markShipped({
      orderId: "order-1", actorId: "seller-1", version: 3,
      company: "Test Express", trackingNumber,
    }), (error) => error.status === 400);
    assert.equal(writes.length, 0);
  });
}

function fixture(overrides = {}, changed = 1) {
  const order = {
    id: "order-1",
    buyerId: "buyer-1",
    sellerId: "seller-1",
    status: "confirmed",
    version: 3,
    ordersAmount: 100,
    originalAmount: 100,
    shipping: {
      status: "pending",
      addressId: "old",
      addressSnapshot: { ...ADDRESS, addressLine: "Old Road" },
    },
    ...overrides,
  };
  const writes = [];
  const tx = {
    order: {
      findUnique: async () => order,
      updateMany: async (query) => {
        writes.push({ table: "order", query });
        return { count: changed };
      },
    },
    shipping: {
      updateMany: async (query) => {
        writes.push({ table: "shipping", query });
        return { count: 1 };
      },
      update: async (query) => {
        writes.push({ table: "shipping_update", query });
        return { count: 1 };
      },
      findUnique: async () => ({ orderId: order.id, addressSnapshot: ADDRESS }),
    },
    orderLog: {
      create: async ({ data }) => {
        writes.push({ table: "log", data });
      },
    },
  };
  let selectedAddress = ADDRESS;
  const service = createShippingService({
    $transaction: async (callback) => callback(tx),
  }, async () => normalizeAddress(selectedAddress));
  const request = {
    orderId: order.id,
    buyerId: "buyer-1",
    addressId: "new",
    shippingAddress: ADDRESS,
  };
  return { service, request, writes, order, setSelectedAddress: (value) => { selectedAddress = value; } };
}

for (const [company, trackingNumber] of [
  [undefined, "SIM123"],
  ["", "SIM123"],
  ["   ", "SIM123"],
  ["Test Express", undefined],
  ["Test Express", ""],
  ["Test Express", "   "],
]) {
  test(`shipment requires both company (${JSON.stringify(company)}) and tracking (${JSON.stringify(trackingNumber)})`, async () => {
    const { service, writes } = fixture({ status: "ready_to_ship" });
    await assert.rejects(
      service.markShipped({
        orderId: "order-1",
        actorId: "seller-1",
        version: 3,
        company,
        trackingNumber,
      }),
      (error) =>
        error.status === 400 &&
        error.message === "company and trackingNumber are required to ship an order",
    );
    assert.equal(writes.length, 0);
  });
}

for (const [field, value] of [
  ["phone", "12345"],
  ["postalCode", "ABCDE"],
]) {
  test(`TC05: invalid shipping ${field} is rejected without writes`, async () => {
    const { service, request, writes, setSelectedAddress } = fixture();
    setSelectedAddress({ ...ADDRESS, [field]: value });
    await assert.rejects(
      service.updateAddress(request),
      (err) => err.status === 400,
    );
    assert.equal(writes.length, 0);
  });
}

test("buyer changes only this order's address and records both address snapshots", async () => {
  const { service, request, writes } = fixture();
  await service.updateAddress(request);
  assert.equal(writes[0].query.where.version, 3);
  assert.equal(writes[1].query.where.orderId, "order-1");
  const log = writes.find((entry) => entry.table === "log").data;
  assert.equal(log.actorId, "buyer-1");
  const detail = JSON.parse(log.detail);
  assert.equal(detail.before.addressId, "old");
  assert.equal(detail.after.addressId, "new");
  assert.equal(detail.before.addressSnapshot.addressLine, "Old Road");
  assert.equal(detail.after.addressSnapshot.addressLine, "99 Main Road");
});

test("another buyer cannot change the order's delivery address", async () => {
  const { service, request, writes } = fixture();
  await assert.rejects(
    service.updateAddress({ ...request, buyerId: "other" }),
    (error) => error.status === 403,
  );
  assert.equal(writes.length, 0);
});

test("shipped orders cannot change address even if shipping has not caught up", async () => {
  const { service, request, writes } = fixture({ status: "shipped" });
  await assert.rejects(
    service.updateAddress(request),
    (error) => error.status === 409,
  );
  assert.equal(writes.length, 0);
});

test("shipped parcels cannot change address even if Order still says confirmed", async () => {
  const { service, request, writes } = fixture({
    shipping: { status: "shipped" },
  });
  await assert.rejects(
    service.updateAddress(request),
    (error) => error.status === 409,
  );
  assert.equal(writes.length, 0);
});

test("a concurrent shipment prevents the address write and its audit log", async () => {
  const { service, request, writes } = fixture({}, 0);
  await assert.rejects(
    service.updateAddress(request),
    (error) => error.status === 409,
  );
  assert.deepEqual(
    writes.map((entry) => entry.table),
    ["order"],
  );
});

test("stale client version and incomplete selected addresses are rejected before writes", async () => {
  const { service, request, writes, setSelectedAddress } = fixture();
  await assert.rejects(
    service.updateAddress({ ...request, version: 2 }),
    (error) => error.status === 409,
  );
  setSelectedAddress({ ...ADDRESS, phone: "" });
  await assert.rejects(
    service.updateAddress(request),
    (error) => error.status === 400,
  );
  assert.equal(writes.length, 0);
});

test("markShipped: rejects if caller is not the seller", async () => {
  const { service } = fixture({ status: "ready_to_ship" });
  await assert.rejects(
    service.markShipped({
      orderId: "order-1",
      actorId: "buyer-1",
      version: 3,
      company: "Flash Express",
      trackingNumber: "TH12345",
    }),
    (error) => error.status === 403,
  );
});

test("markShipped: rejects if the order is not ready to ship yet (status is paid)", async () => {
  const { service } = fixture({ status: "paid" });
  await assert.rejects(
    service.markShipped({
      orderId: "order-1",
      actorId: "seller-1",
      version: 3,
      company: "Flash Express",
      trackingNumber: "TH12345",
    }),
    (error) => {
      assert.equal(error.status, 409);
      assert.match(error.message, /ต้องเตรียมสินค้าให้พร้อมจัดส่งก่อน/);
      return true;
    },
  );
});

for (const trackingNumber of ["TH12345", "1234567890"]) {
test(`markShipped: accepts tracking ${trackingNumber} for a ready-to-ship order`, async () => {
  const { service, writes } = fixture({ status: "ready_to_ship" });
  const result = await service.markShipped({
    orderId: "order-1",
    actorId: "seller-1",
    version: 3,
    company: "Flash Express",
    trackingNumber,
  });
  assert.ok(result);
  const orderWrite = writes.find((w) => w.table === "order");
  assert.equal(orderWrite.query.data.status, "shipped");
  const shippingUpdate = writes.find((w) => w.table === "shipping_update");
  assert.equal(shippingUpdate.query.data.company, "Flash Express");
  assert.equal(shippingUpdate.query.data.trackingNumber, trackingNumber);
});
}

