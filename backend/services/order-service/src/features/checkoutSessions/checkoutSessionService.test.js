const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createCheckoutSessionService,
  PAYMENT_TTL_MS,
} = require("./checkoutSessionService");
const NOW = new Date("2026-08-10T12:00:00Z");
const ADDRESS = {
  recipientName: "Buyer",
  phone: "0812345678",
  addressLine: "99 Road",
  subdistrict: "Area",
  district: "District",
  province: "Bangkok",
  postalCode: "10110",
};
function fixture(extra = {}) {
  const state = {
    checkout: null,
    orders: [
      {
        id: "o1",
        buyerId: "b1",
        sellerId: "s1",
        productId: "p1",
        originalAmount: "1000.50",
        ordersAmount: "900.25",
        campaignId: "v1",
        status: "pending_payment",
        checkoutId: null,
        basketId: "basket1",
        basket: { unlockAt: new Date(NOW.getTime() + 300000) },
        version: 1,
      },
      {
        id: "o2",
        buyerId: "b1",
        sellerId: "s2",
        productId: "p2",
        originalAmount: "500.25",
        ordersAmount: "500.25",
        status: "pending_payment",
        checkoutId: null,
        basketId: null,
        orderType: "AUCTION",
        version: 1,
      },
    ],
    payments: [],
    logs: [],
    shipping: [],
    ...extra,
  };
  let externalFailure = false;
  const calls = { extended: [], products: [], vouchers: [], released: [] };
  const matches = (row, where) =>
    Object.entries(where).every(([k, v]) => {
      if (v && typeof v === "object" && !(v instanceof Date)) {
        if (v.in) return v.in.includes(row[k]);
        if (v.gt) return row[k] > v.gt;
        if (v.lte) return row[k] <= v.lte;
      }
      return row[k] === v;
    });
  const apply = (row, data) =>
    Object.entries(data).forEach(([k, v]) => {
      row[k] = v?.increment ? row[k] + v.increment : v;
    });
  const orderView = (o) => ({
    ...o,
    payments: state.payments.filter((p) => p.orderId === o.id),
    shipping: state.shipping.find((s) => s.orderId === o.id),
  });
  const checkoutView = () =>
    state.checkout && {
      ...state.checkout,
      orders: state.orders
        .filter((o) => o.checkoutId === state.checkout.id)
        .map(orderView),
    };
  const db = {
    checkout: {
      create: async ({ data }) => {
        state.checkout = {
          id: "c1",
          paidAt: null,
          ...data,
          originalAmount: String(data.originalAmount),
          ordersAmount: String(data.ordersAmount),
        };
        return state.checkout;
      },
      findUnique: async () => checkoutView(),
      findMany: async ({ where }) =>
        state.checkout && matches(state.checkout, where)
          ? [checkoutView()]
          : [],
      updateMany: async ({ where, data }) => {
        if (!state.checkout || !matches(state.checkout, where))
          return { count: 0 };
        apply(state.checkout, data);
        return { count: 1 };
      },
    },
    order: {
      findMany: async () => state.orders.map(orderView),
      updateMany: async ({ where, data }) => {
        const rows = state.orders.filter((o) => matches(o, where));
        rows.forEach((o) => apply(o, data));
        return { count: rows.length };
      },
    },
    basket: {
      update: async ({ where, data }) => {
        Object.assign(
          state.orders.find((o) => o.basketId === where.id).basket,
          data,
        );
      },
    },
    shipping: {
      create: async ({ data }) => {
        state.shipping.push(data);
        return data;
      },
      update: async ({ where, data }) =>
        Object.assign(
          state.shipping.find((s) => s.orderId === where.orderId),
          data,
        ),
    },
    payment: {
      create: async ({ data }) => {
        state.payments.push({
          id: "pay" + state.payments.length,
          holds: [],
          ...data,
        });
        return data;
      },
    },
    orderLog: {
      create: async ({ data }) => {
        const row = { id: "log" + state.logs.length, ...data };
        state.logs.push(row);
        return row;
      },
      findUnique: async ({ where }) =>
        state.logs.find((l) => l.id === where.id),
      findFirst: async ({ where }) => state.logs.find((l) => matches(l, where)),
      findMany: async ({ where }) =>
        state.logs.filter((l) => matches(l, where)),
    },
  };
  db.$transaction = async (cb) => {
    const before = structuredClone(state);
    try {
      return await cb(db);
    } catch (err) {
      Object.assign(state, before);
      throw err;
    }
  };
  const products = {
    extendProductReservation: async (...args) => calls.extended.push(args),
    completeProductReservation: async (...args) => {
      if (externalFailure) throw new Error("product unavailable");
      calls.products.push(args);
    },
    setProductStatus: async (...args) => calls.products.push(args),
    releaseVoucher: async (...args) => calls.released.push(args),
    completeVoucher: async (...args) => calls.vouchers.push(args),
  };
  const service = createCheckoutSessionService(db, products);
  const create = (overrides) =>
    service.create({
      buyerId: "b1",
      orderIds: ["o1", "o2"],
      addressId: "a1",
      shippingAddress: ADDRESS,
      now: NOW,
      ...overrides,
    });
  return {
    state,
    db,
    calls,
    service,
    create,
    failExternal: (value) => {
      externalFailure = value;
    },
  };
}
test("multi-seller checkout sums baht exactly; vouchers remain per order; auction has no basket", async () => {
  const f = fixture();
  const result = await f.create();
  assert.equal(result.total, 1400.5);
  assert.equal(result.subtotal, 1500.75);
  assert.equal(result.discount, 100.25);
  assert.equal(f.calls.extended.length, 1);
  assert.equal(f.state.shipping.length, 2);
  assert.equal(f.state.shipping[0].addressId, "a1");
  assert.equal(result.paidAt, null);
  assert.equal(result.cancelAt.getTime(), NOW.getTime() + PAYMENT_TTL_MS);
});
test("repeat creation returns the same checkout", async () => {
  const f = fixture();
  await f.create();
  const result = await f.create();
  assert.equal(result.id, "c1");
  assert.equal(f.state.shipping.length, 2);
});
test("checkout cannot accept a code shared across orders", async () => {
  const f = fixture();
  await assert.rejects(f.create({ couponCode: "SAVE10" }), /per order/);
  assert.equal(f.state.checkout, null);
});
test("creation requires address ID and rejects expired basket", async () => {
  const f = fixture();
  await assert.rejects(f.create({ addressId: "" }), /addressId/);
  f.state.orders[0].basket.unlockAt = NOW;
  await assert.rejects(f.create(), /reservation has expired/);
});
test("concurrent order change rolls back checkout and shipping creation", async () => {
  const f = fixture();
  const update = f.db.order.updateMany;
  f.db.order.updateMany = async (args) =>
    args.where.id === "o2" ? { count: 0 } : update(args);
  await assert.rejects(f.create(), /cart changed/);
  assert.equal(f.state.checkout, null);
  assert.equal(f.state.shipping.length, 0);
  assert.equal(f.state.orders[0].checkoutId, null);
});
test("payment retry after external failure does not charge or confirm orders twice", async () => {
  const f = fixture();
  await f.create();
  f.failExternal(true);
  const input = {
    buyerId: "b1",
    sessionId: "c1",
    now: new Date(NOW.getTime() + 60000),
  };
  await assert.rejects(f.service.confirm(input), /unavailable/);
  assert.equal(f.state.checkout.status, "processing");
  assert.equal(f.state.payments.length, 2);
  assert.ok(f.state.payments.every((p) => p.paidAt instanceof Date));
  f.failExternal(false);
  const result = await f.service.confirm(input);
  assert.equal(result.status, "paid");
  assert.equal(f.state.payments.length, 2);
  assert.equal(f.calls.products.length, 2);
  await f.service.confirm(input);
  assert.equal(f.calls.products.length, 2);
  assert.equal(f.state.payments.length, 2);
});
test("foreign buyer cannot read or confirm checkout", async () => {
  const f = fixture();
  await f.create();
  await assert.rejects(
    f.service.confirm({ buyerId: "other", sessionId: "c1", now: NOW }),
    (err) => err.status === 403,
  );
});
test("expiry cancels orders and durably requests release without marking payment paid", async () => {
  const f = fixture();
  await f.create();
  await f.service.expireDue({ now: new Date(NOW.getTime() + PAYMENT_TTL_MS) });
  assert.equal(f.state.checkout.status, "expired");
  assert.ok(f.state.orders.every((o) => o.status === "cancelled"));
  assert.equal(f.state.payments.length, 0);
  assert.equal(f.calls.released.length, 1);
  const actions = f.state.logs
    .filter((l) => l.action === "PRODUCT_SYNC_REQUESTED")
    .map((l) => JSON.parse(l.detail).action);
  assert.deepEqual(actions, ["RELEASE_RESERVATION", "SET_STATUS"]);
});
test("payment CAS conflict rolls back every local payment", async () => {
  const f = fixture();
  await f.create();
  const update = f.db.order.updateMany;
  f.db.order.updateMany = async (args) =>
    args.where.id === "o2" ? { count: 0 } : update(args);
  await assert.rejects(
    f.service.confirm({ buyerId: "b1", sessionId: "c1", now: NOW }),
    /order changed/,
  );
  assert.equal(f.state.checkout.status, "pending");
  assert.equal(f.state.payments.length, 0);
  assert.ok(f.state.orders.every((o) => o.status === "pending_payment"));
});
