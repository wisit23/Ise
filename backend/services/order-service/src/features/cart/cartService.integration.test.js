const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { PrismaClient } = require("../../generated/prisma-client");
const { wrapClient } = require("../../models/erClient");
const orderModel = require("../../models/orderModel");
const { createCartService } = require("./cartService");
const chat = require("../../services/chatClient");
const {
  createCheckoutSessionService,
} = require("../checkoutSessions/checkoutSessionService");

test("cart to checkout persists reservations separately and serializes order creation", async (t) => {
  if (!process.env.CART_TEST_DATABASE_URL)
    return t.skip("Set CART_TEST_DATABASE_URL for isolated PostgreSQL checks");
  const schema = `cart_order_test_${randomUUID().replaceAll("-", "")}`;
  const url = new URL(process.env.CART_TEST_DATABASE_URL);
  url.searchParams.set("schema", schema);
  const migration = spawnSync(
    process.execPath,
    [
      require.resolve("prisma/build/index.js"),
      "migrate",
      "deploy",
      "--schema",
      path.resolve(__dirname, "../../../prisma/schema.prisma"),
    ],
    { env: { ...process.env, DATABASE_URL: url.toString() }, encoding: "utf8" },
  );
  assert.equal(migration.status, 0, migration.stdout + migration.stderr);
  const raw = new PrismaClient({
    datasources: { db: { url: url.toString() } },
  });
  const db = wrapClient(raw);
  t.after(async () => {
    assert.match(schema, /^cart_order_test_[a-f0-9]{32}$/);
    await raw.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await raw.$disconnect();
  });
  const reservations = new Map();
  const released = [];
  const held = [];
  const notifications = [];
  const completedReservations = [];
  const completedVouchers = [];
  t.mock.method(chat, "notifyOrderPaid", async () => {});
  const products = {
    getProduct: async (id) => ({
      id,
      title: `Product ${id}`,
      sellerId: "seller",
      price: 100,
      category: "clothes",
    }),
    reserveProduct: async (id, buyerId) => {
      if (reservations.has(id))
        return { ...reservations.get(id), created: false };
      const reservation = {
        created: true,
        reservationId: randomUUID(),
        expiresAt: new Date(Date.now() + 600000),
        product: {
          id,
          title: `Product ${id}`,
          sellerId: "seller",
          price: 100,
          category: "clothes",
        },
        buyerId,
      };
      reservations.set(id, reservation);
      return reservation;
    },
    releaseProductReservation: async (id, reservationId) => {
      released.push(reservationId);
      reservations.delete(id);
    },
    validateVoucherDiscount: async () => ({
      campaignCode: "SAVE10",
      discountAmount: 10,
      finalPrice: 90,
    }),
    quoteAndHold: async (campaignId, { orderId }) => {
      held.push(orderId);
      return {
        campaignId,
        campaignCode: "SAVE10",
        discountAmount: 10,
        finalPrice: 90,
      };
    },
    releaseVoucher: async () => {},
    extendProductReservation: async () => {},
    completeProductReservation: async (productId, reservationId) =>
      completedReservations.push(reservationId),
    completeVoucher: async (campaignId, { orderId }) =>
      completedVouchers.push(orderId),
  };
  const service = createCartService({
    db,
    productClient: products,
    orderModel,
    authorize: async () => {},
    orderPlaced: async (order) => notifications.push(order.id),
  });

  await t.test(
    "adding and reading the cart never creates orders or holds vouchers",
    async () => {
      const [item, duplicate] = await Promise.all(
        [1, 2].map(() =>
          service.add({
            buyerId: "buyer",
            productId: "p1",
            campaignId: "voucher",
          }),
        ),
      );
      assert.equal(duplicate.id, item.id);
      assert.equal(item.orderId, null);
      assert.equal(item.finalPrice, 90);
      assert.equal(await db.order.count(), 0);
      assert.equal(await db.basket.count(), 1);
      assert.equal(held.length, 0);
      assert.equal(notifications.length, 0);
      const again = await service.add({ buyerId: "buyer", productId: "p1" });
      assert.equal(again.id, item.id);
      assert.equal(again.campaignId, "voucher");
      assert.equal((await service.list({ buyerId: "buyer" })).total, 1);
    },
  );
  const basket = await db.basket.findFirst({ where: { productId: "p1" } });
  let order;
  await t.test(
    "concurrent checkout entry and refresh reuse one order and voucher hold",
    async () => {
      const input = { buyerId: "buyer", basketIds: [basket.id] };
      const [a, b] = await Promise.all([
        service.prepare(input),
        service.prepare(input),
      ]);
      order = a.items[0];
      assert.equal(b.items[0].id, order.id);
      assert.equal((await service.prepare(input)).items[0].id, order.id);
      assert.equal(await db.order.count(), 1);
      assert.equal(await db.basket.count(), 1);
      assert.equal(order.basketId, basket.id);
      assert.equal(order.finalPrice, 90);
      assert.equal(held.length, 1);
      assert.deepEqual(notifications, [order.id]);
      const cart = await service.list({ buyerId: "buyer" });
      assert.equal(cart.items[0].orderId, order.id);
      assert.equal(cart.items[0].id, basket.id);
    },
  );
  await t.test(
    "another buyer cannot prepare or remove the reservation",
    async () => {
      await assert.rejects(
        service.prepare({ buyerId: "other", basketIds: [basket.id] }),
        /unavailable/,
      );
      await assert.rejects(
        service.remove({ buyerId: "other", basketId: basket.id }),
        /not found/,
      );
      assert.equal(await db.order.count(), 1);
    },
  );
  await t.test(
    "a reservation with an order must use the existing order cancellation flow",
    async () => {
      await assert.rejects(
        service.remove({ buyerId: "buyer", basketId: basket.id }),
        /already has an order/,
      );
      assert.equal(released.length, 0);
    },
  );
  await t.test(
    "removing an unconverted cart item releases its product and creates no order",
    async () => {
      const item = await service.add({ buyerId: "buyer", productId: "p2" });
      await service.remove({ buyerId: "buyer", basketId: item.id });
      assert.equal(
        (await db.basket.findUnique({ where: { id: item.id } })).status,
        "cancelled",
      );
      assert.deepEqual(released, [item.id]);
      await assert.rejects(
        service.prepare({ buyerId: "buyer", basketIds: [item.id] }),
        /unavailable/,
      );
      assert.equal(await db.order.count(), 1);
    },
  );
  await t.test("expired cart reservations cannot create orders", async () => {
    const item = await service.add({ buyerId: "buyer", productId: "p3" });
    await db.basket.update({
      where: { id: item.id },
      data: { unlockAt: new Date(0) },
    });
    await assert.rejects(
      service.prepare({ buyerId: "buyer", basketIds: [item.id] }),
      /expired/,
    );
    assert.equal(await db.order.count(), 1);
  });
  await t.test(
    "rejected voucher leaves the cart reservation usable and creates no order",
    async (st) => {
      const item = await service.add({
        buyerId: "buyer",
        productId: "invalid-voucher-product",
        campaignId: "invalid",
      });
      st.mock.method(products, "quoteAndHold", async () => {
        throw new Error("voucher expired");
      });
      await assert.rejects(
        service.prepare({ buyerId: "buyer", basketIds: [item.id] }),
        /voucher expired/,
      );
      assert.equal(await db.order.count(), 1);
      assert.equal(
        (
          await db.basket.findUnique({
            where: { id: item.id },
            include: { order: true },
          })
        ).order,
        null,
      );
      assert.ok(reservations.has("invalid-voucher-product"));
      await service.remove({ buyerId: "buyer", basketId: item.id });
    },
  );
  await t.test(
    "existing auction orders stay in the cart without conversion",
    async () => {
      await db.order.create({
        data: {
          buyerId: "buyer",
          sellerId: "seller",
          productId: "auction-product",
          orderType: "AUCTION",
          auctionId: randomUUID(),
          originalAmount: 50,
          ordersAmount: 50,
          status: "pending_payment",
        },
      });
      const cart = await service.list({ buyerId: "buyer" });
      assert.equal(cart.total, 2);
      assert.ok(
        cart.items.some((item) => item.auctionId && item.orderId === item.id),
      );
    },
  );
  await t.test(
    "prepared orders support shipping checkout and idempotent payment",
    async () => {
      const address = {
        recipientName: "Buyer",
        phone: "0800000000",
        addressLine: "Road",
        subdistrict: "A",
        district: "B",
        province: "Bangkok",
        postalCode: "10110",
      };
      const checkout = createCheckoutSessionService(
        db,
        products,
        { recordOrderActivity: async () => {} },
        async () => address,
      );
      const session = await checkout.create({
        buyerId: "buyer",
        orderIds: [order.id],
        addressId: "address",
      });
      assert.equal(session.total, 90);
      assert.equal(session.orders[0].shippingAddress.recipientName, "Buyer");
      assert.equal(
        (await checkout.get({ buyerId: "buyer", sessionId: session.id }))
          .orders[0].id,
        order.id,
      );
      assert.equal(await db.order.count({ where: { basketId: basket.id } }), 1);
      const paid = await checkout.confirm({
        buyerId: "buyer",
        sessionId: session.id,
      });
      assert.equal(paid.status, "paid");
      assert.equal(paid.orders[0].status, "confirmed");
      assert.equal(await db.payment.count({ where: { orderId: order.id } }), 1);
      await checkout.confirm({ buyerId: "buyer", sessionId: session.id });
      assert.equal(await db.payment.count({ where: { orderId: order.id } }), 1);
      assert.deepEqual(completedReservations, [basket.id]);
      assert.deepEqual(completedVouchers, [order.id]);
      assert.equal((await service.list({ buyerId: "buyer" })).total, 1);
    },
  );
  await t.test(
    "concurrent cart removal cannot release a product after its order is created",
    async () => {
      const item = await service.add({
        buyerId: "buyer",
        productId: "race-product",
      });
      const [prepared, removed] = await Promise.allSettled([
        service.prepare({ buyerId: "buyer", basketIds: [item.id] }),
        service.remove({ buyerId: "buyer", basketId: item.id }),
      ]);
      const row = await db.basket.findUnique({
        where: { id: item.id },
        include: { order: true },
      });
      if (prepared.status === "fulfilled") {
        assert.equal(removed.status, "rejected");
        assert.ok(row.order);
        assert.ok(!released.includes(item.id));
      } else {
        assert.equal(removed.status, "fulfilled");
        assert.equal(row.order, null);
        assert.equal(row.status, "cancelled");
        assert.ok(released.includes(item.id));
      }
    },
  );
});
