const test = require("node:test");
const assert = require("node:assert/strict");
const { createShippingService, normalizeAddress } = require("./shippingService");

const ADDRESS = {
  recipientName: "Buyer", phone: "0812345678", addressLine: "99 Main Road",
  subdistrict: "A", district: "B", province: "Bangkok", postalCode: "10110",
};

function fixture(overrides = {}, changed = 1) {
  let order = {
    id: "order-1", buyerId: "buyer-1", sellerId: "seller-1", status: "confirmed",
    version: 3, ordersAmount: 100, originalAmount: 100,
    shipping: { status: "pending", addressId: "old", addressSnapshot: { ...ADDRESS, addressLine: "Old Road" } },
    ...overrides,
  };
  const writes = [];
  let selectedAddress = ADDRESS;
  let failShipping = false;
  const service = createShippingService({
    $transaction: async (callback) => {
      const pending = structuredClone(order);
      const tx = {
        order: {
          findUnique: async () => structuredClone(pending),
          updateMany: async (query) => {
            writes.push({ table: "order", query });
            if (changed) {
              const { version, ...data } = query.data;
              Object.assign(pending, data);
              pending.version += version?.increment || 0;
            }
            return { count: changed };
          },
        },
        shipping: {
          updateMany: async (query) => {
            writes.push({ table: "shipping", query });
            pending.shipping = { ...pending.shipping, ...query.data };
            return { count: 1 };
          },
          update: async (query) => {
            if (failShipping) throw new Error("shipping write failed");
            writes.push({ table: "shipping_update", query });
            Object.assign(pending.shipping, query.data);
            return pending.shipping;
          },
          findUnique: async () => pending.shipping,
        },
        orderLog: { create: async ({ data }) => { writes.push({ table: "log", data }); } },
      };
      const result = await callback(tx);
      order = pending;
      return result;
    },
  }, async () => normalizeAddress(selectedAddress));
  return {
    service, writes, request: { orderId: order.id, buyerId: "buyer-1", addressId: "new", shippingAddress: ADDRESS },
    getOrder: () => order,
    setSelectedAddress: (value) => { selectedAddress = value; },
    failShipping: () => { failShipping = true; },
  };
}
const step = (status, extra = {}) => ({ orderId: "order-1", actorId: "seller-1", version: 3, status, ...extra });
const handoff = (extra = {}) => step("in_transit", { company: " Flash Express ", trackingNumber: " TH123456789TH ", ...extra });

// Tracking rule: 8-20 English letters or digits, at least one digit.
for (const trackingNumber of ["TH123456789TH", "KER1234567890", "1234567890", "12345678"]) {
  test(`handoff accepts tracking ${trackingNumber}`, async () => {
    const f = fixture({ status: "pickup_in_progress" });
    const updated = await f.service.advanceShipping(handoff({ trackingNumber }));
    assert.equal(updated.shipping.trackingNumber, trackingNumber);
  });
}
for (const trackingNumber of [
  "LETTERS", "พัสดุ", "AB 123", "AB-123", "123!", "fhfueueduejdeudhe", "----",
  "TH12", "TH12345", "TH 1234 5678", "1".repeat(21),
]) {
  test(`handoff rejects tracking ${JSON.stringify(trackingNumber)} without writes`, async () => {
    const f = fixture({ status: "pickup_in_progress" });
    await assert.rejects(f.service.advanceShipping(handoff({ trackingNumber })), (e) => e.status === 400);
    assert.equal(f.writes.length, 0);
  });
}

for (const [company, trackingNumber] of [
  [undefined, "SIM12345"], ["", "SIM12345"], ["   ", "SIM12345"],
  ["Test Express", undefined], ["Test Express", ""], ["Test Express", "   "],
]) {
  test(`handoff requires company (${JSON.stringify(company)}) and tracking (${JSON.stringify(trackingNumber)})`, async () => {
    const { service, writes } = fixture({ status: "pickup_in_progress" });
    await assert.rejects(service.advanceShipping(handoff({ company, trackingNumber })), (e) => e.status === 400);
    assert.equal(writes.length, 0);
  });
}
for (const [field, value] of [["phone", "12345"], ["phone", "1111111111"], ["postalCode", "ABCDE"]]) {
  test(`TC05: invalid shipping ${field} ${value} is rejected without writes`, async () => {
    const f = fixture();
    f.setSelectedAddress({ ...ADDRESS, [field]: value });
    await assert.rejects(f.service.updateAddress(f.request), (e) => e.status === 400);
    assert.equal(f.writes.length, 0);
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
  await assert.rejects(service.updateAddress({ ...request, buyerId: "other" }), (e) => e.status === 403);
  assert.equal(writes.length, 0);
});
for (const status of ["ready_to_ship", "pickup_in_progress", "in_transit"]) {
  test(`${status} orders cannot change address`, async () => {
    const { service, request, writes } = fixture({ status });
    await assert.rejects(service.updateAddress(request), (e) => e.status === 409);
    assert.equal(writes.length, 0);
  });
}
for (const status of ["pickup_in_progress", "in_transit"]) {
  test(`${status} parcels cannot change address even if Order still says confirmed`, async () => {
    const { service, request, writes } = fixture({ shipping: { status } });
    await assert.rejects(service.updateAddress(request), (e) => e.status === 409);
    assert.equal(writes.length, 0);
  });
}
test("a concurrent shipment prevents the address write and audit log", async () => {
  const { service, request, writes } = fixture({}, 0);
  await assert.rejects(service.updateAddress(request), (e) => e.status === 409);
  assert.deepEqual(writes.map((entry) => entry.table), ["order"]);
});
test("stale client version and incomplete selected addresses are rejected before writes", async () => {
  const f = fixture();
  await assert.rejects(f.service.updateAddress({ ...f.request, version: 2 }), (e) => e.status === 409);
  f.setSelectedAddress({ ...ADDRESS, phone: "" });
  await assert.rejects(f.service.updateAddress(f.request), (e) => e.status === 400);
  assert.equal(f.writes.length, 0);
});
for (const [from, to] of [["paid", "pickup_in_progress"], ["confirmed", "in_transit"], ["ready_to_ship", "in_transit"], ["pickup_in_progress", "pickup_in_progress"]]) {
  test(`reject shipping skip/repeat ${from} -> ${to}`, async () => {
    const f = fixture({ status: from });
    await assert.rejects(f.service.advanceShipping(handoff({ status: to })), (e) => e.status === 409);
    assert.equal(f.writes.length, 0);
  });
}
for (const status of ["pickup_in_progress", "in_transit"]) {
  const from = status === "in_transit" ? "pickup_in_progress" : "ready_to_ship";
  test(`buyer cannot enter ${status}`, async () => {
    const f = fixture({ status: from });
    await assert.rejects(f.service.advanceShipping(handoff({ status, actorId: "buyer-1" })), (e) => e.status === 403);
    assert.equal(f.writes.length, 0);
  });
  for (const blocked of [{ payments: [{ holds: [{ releaseAt: null }] }] }, { dispute: { decision: null } }, { status: "disputed" }]) {
    test(`${status} blocked by ${JSON.stringify(blocked)}`, async () => {
      const f = fixture({ status: from, ...blocked });
      await assert.rejects(f.service.advanceShipping(handoff({ status })), (e) => e.status === 409);
      assert.equal(f.writes.length, 0);
    });
  }
}
for (const status of ["confirmed", "ready_to_ship"]) {
test(`pickup from ${status} saves carrier/tracking without a handoff timestamp`, async () => {
  const f = fixture({ status });
  const before = structuredClone(f.getOrder().shipping);
  const updated = await f.service.advanceShipping(handoff({ status: "pickup_in_progress" }));
  assert.equal(updated.status, "pickup_in_progress");
  assert.equal(updated.shippedAt, undefined);
  assert.deepEqual(updated.shipping, { ...before, status: "pickup_in_progress", company: "Flash Express", trackingNumber: "TH123456789TH" });
  assert.equal(updated.version, 4);
  assert.equal(JSON.parse(f.writes.find((w) => w.table === "log").data.detail).from, status);
});
}

for (const details of [{}, { company: "Carrier" }, { company: "Carrier", trackingNumber: "LETTERS" }]) {
  test(`pickup requires valid shipping details: ${JSON.stringify(details)}`, async () => {
    const f = fixture();
    await assert.rejects(f.service.advanceShipping(step("pickup_in_progress", details)), (e) => e.status === 400);
    assert.equal(f.writes.length, 0);
  });
}

test("handoff reuses saved carrier and tracking after reopening the order", async () => {
  const f = fixture();
  const pickup = await f.service.advanceShipping(handoff({ status: "pickup_in_progress" }));
  const shipped = await f.service.advanceShipping(step("in_transit", { version: pickup.version }));
  assert.equal(shipped.shipping.company, "Flash Express");
  assert.equal(shipped.shipping.trackingNumber, "TH123456789TH");
  assert.ok(shipped.shippedAt);
});
test("handoff updates both statuses, trims tracking, stamps shippedAt and retains address facts", async () => {
  const f = fixture({ status: "pickup_in_progress" });
  const before = structuredClone(f.getOrder().shipping);
  const updated = await f.service.advanceShipping(handoff());
  assert.equal(updated.status, "in_transit");
  assert.ok(updated.shippedAt instanceof Date);
  assert.equal(updated.version, 4);
  assert.deepEqual(updated.shipping, { ...before, status: "in_transit", company: "Flash Express", trackingNumber: "TH123456789TH" });
  assert.equal(f.writes.find((w) => w.table === "log").data.action, "IN_TRANSIT");
});
test("failed Shipping write rolls back Order handoff", async () => {
  const f = fixture({ status: "pickup_in_progress" });
  f.failShipping();
  await assert.rejects(f.service.advanceShipping(handoff()), /shipping write failed/);
  assert.equal(f.getOrder().status, "pickup_in_progress");
  assert.equal(f.getOrder().shippedAt, undefined);
  assert.equal(f.writes.filter((w) => w.table === "log").length, 0);
});
test("stale or concurrently changed Order cannot hand off", async () => {
  for (const [f, version] of [[fixture({ status: "pickup_in_progress" }), 2], [fixture({ status: "pickup_in_progress" }, 0), 3]]) {
    await assert.rejects(f.service.advanceShipping(handoff({ version })), (e) => e.status === 409);
    assert.equal(f.getOrder().status, "pickup_in_progress");
  }
});
test("legacy shipped is not accepted as an API shipping transition", async () => {
  const f = fixture({ status: "ready_to_ship" });
  await assert.rejects(f.service.advanceShipping(step("shipped")), (e) => e.status === 400);
  assert.equal(f.writes.length, 0);
});

test("seller edits pickup details, keeps status/address/timestamps and audits the previous values", async () => {
  const f = fixture({ status: "pickup_in_progress", shipping: { status: "pickup_in_progress", addressSnapshot: ADDRESS, company: "Old Carrier", trackingNumber: "OLD12345" } });
  const updated = await f.service.updateDetails(handoff());
  assert.equal(updated.status, "pickup_in_progress");
  assert.equal(updated.shipping.status, "pickup_in_progress");
  assert.equal(updated.shipping.trackingNumber, "TH123456789TH");
  assert.equal(updated.shipping.company, "Flash Express");
  assert.deepEqual(updated.shipping.addressSnapshot, ADDRESS);
  assert.equal(updated.shippedAt, undefined);
  assert.equal(updated.version, 4);
  const audit = f.writes.find(w => w.table === "log").data;
  assert.equal(audit.action, "SHIPPING_DETAILS_CHANGED");
  assert.deepEqual(JSON.parse(audit.detail).before, { company: "Old Carrier", trackingNumber: "OLD12345" });
  const shipped = await f.service.advanceShipping(step("in_transit", { version: updated.version }));
  assert.equal(shipped.shipping.trackingNumber, "TH123456789TH");
});

for (const status of ["paid", "confirmed", "in_transit", "delivered", "completed"]) {
  test(`cannot edit saved shipping details at ${status}`, async () => {
    const f = fixture({ status });
    await assert.rejects(f.service.updateDetails(handoff()), e => e.status === 409);
    assert.equal(f.writes.length, 0);
  });
}
for (const [overrides, input, error] of [
  [{}, { actorId: "buyer-1" }, 403],
  [{}, { version: 2 }, 409],
  [{}, { trackingNumber: "INVALID" }, 400],
  [{}, { company: "" }, 400],
  [{ payments: [{ holds: [{ releaseAt: null }] }] }, {}, 409],
  [{ dispute: { decision: null } }, {}, 409],
]) {
  test(`shipping edit rejects invalid or blocked request ${JSON.stringify([overrides, input])}`, async () => {
    const f = fixture({ status: "pickup_in_progress", ...overrides });
    await assert.rejects(f.service.updateDetails(handoff(input)), e => e.status === error);
    assert.equal(f.writes.length, 0);
  });
}
test("a concurrent handoff prevents a shipping edit", async () => {
  const f = fixture({ status: "pickup_in_progress" }, 0);
  await assert.rejects(f.service.updateDetails(handoff()), e => e.status === 409);
  assert.equal(f.writes.filter(w => w.table === "shipping_update").length, 0);
});
