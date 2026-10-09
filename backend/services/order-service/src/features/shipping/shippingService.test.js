const test = require("node:test");
const assert = require("node:assert/strict");
const { createShippingService } = require("./shippingService");

const ADDRESS = {
  recipientName: "Buyer",
  phone: "0812345678",
  addressLine: "99 Main Road",
  subdistrict: "A",
  district: "B",
  province: "Bangkok",
  postalCode: "10110",
};

function fixture(overrides = {}, changed = 1) {
  const order = {
    id: "order-1",
    buyerId: "buyer-1",
    sellerId: "seller-1",
    status: "confirmed",
    version: 3,
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
      findUnique: async () => ({ orderId: order.id, addressSnapshot: ADDRESS }),
    },
    orderLog: {
      create: async ({ data }) => {
        writes.push({ table: "log", data });
      },
    },
  };
  const service = createShippingService({
    $transaction: async (callback) => callback(tx),
  });
  const request = {
    orderId: order.id,
    buyerId: "buyer-1",
    addressId: "new",
    shippingAddress: ADDRESS,
  };
  return { service, request, writes, order };
}

for (const [field, value] of [
  ["phone", "12345"],
  ["postalCode", "ABCDE"],
]) {
  test(`TC05: invalid shipping ${field} is rejected without writes`, async () => {
    const { service, request, writes } = fixture();
    await assert.rejects(
      service.updateAddress({
        ...request,
        shippingAddress: { ...ADDRESS, [field]: value },
      }),
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

test("stale client version and incomplete addresses are rejected before writes", async () => {
  const { service, request, writes } = fixture();
  await assert.rejects(
    service.updateAddress({ ...request, version: 2 }),
    (error) => error.status === 409,
  );
  await assert.rejects(
    service.updateAddress({
      ...request,
      shippingAddress: { ...ADDRESS, phone: "" },
    }),
    (error) => error.status === 400,
  );
  assert.equal(writes.length, 0);
});
