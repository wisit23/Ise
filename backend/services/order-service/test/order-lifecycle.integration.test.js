const { createOrder, ADDRESS } = require("./fixtures");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";
process.env.DATABASE_URL_ORDER ||=
  "postgresql://reloop:reloop_dev_password@127.0.0.1:5432/reloop_order";
if (process.env.DATABASE_URL_ORDER) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_ORDER;
}

const { signAccessToken, permissionsForRoles } = require("@reloop/shared");
const prisma = require("../src/models/prismaClient");
const app = require("../src/app");
const authClient = require("../src/services/authClient");
const productClient = require("../src/services/productClient");
const lifecycle = require("../src/services/orderLifecycleService");

const productStatuses = [];
productClient.setProductStatus = async (productId, status) => {
  productStatuses.push({ productId, status });
  return { ok: true };
};
productClient.releaseProductReservation = async () => ({ ok: true });
productClient.completeProductReservation = async () => ({ ok: true });
productClient.releaseVoucher = async () => null;
productClient.completeVoucher = async () => null;
app.locals.validateAccessSession = async () => {};
authClient.setMockUserResolver(async (id) => ({
  id,
  status: "ACTIVE",
  roles: ["BUYER"],
  role: "BUYER",
}));

const run = `lifecycle-${Date.now()}`;
const buyerId = `${run}-buyer`;
const sellerId = `${run}-seller`;
const scope = { buyerId };
const DAY = 24 * 60 * 60 * 1000;
const token = (sub) =>
  signAccessToken({
    sub,
    role: "BUYER",
    roles: ["BUYER"],
    permissions: permissionsForRoles(["BUYER"]),
  });
const buyer = token(buyerId);
const seller = token(sellerId);

async function reachable(t) {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    if (process.env.REQUIRE_INTEGRATION === "1") throw error;
    t.skip("DATABASE_URL not reachable");
    return false;
  }
}

let seq = 0;
function paidOrder(extra = {}) {
  seq += 1;
  return createOrder(prisma, {
    data: {
      buyerId,
      sellerId,
      productId: `${run}-product-${seq}`,
      productTitle: "Lifecycle test",
      price: 500,
      status: "paid",
      shipping: {
        create: {
          addressId: "addr",
          addressSnapshot: ADDRESS,
          status: "pending",
        },
      },
      ...extra,
    },
  });
}

const patch = (id, auth, body) =>
  request(app)
    .patch(`/${id}/status`)
    .set("Authorization", `Bearer ${auth}`)
    .send(body);

test("order lifecycle: seller steps, simulated delivery, buyer receipt", async (t) => {
  if (!(await reachable(t))) return;
  const order = await paidOrder();

  // Seller cannot skip ahead and the buyer cannot complete before delivery.
  assert.equal((await patch(order.id, seller, { status: "in_transit", company: "K", trackingNumber: "TH12345678" })).status, 409);
  assert.equal((await patch(order.id, buyer, { status: "completed" })).status, 409);
  assert.equal((await patch(order.id, seller, { status: "completed" })).status, 403);

  for (const status of ["confirmed"]) {
    const res = await patch(order.id, seller, { status });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.status, status);
  }
  assert.equal((await patch(order.id, seller, { status: "in_transit", company: "K", trackingNumber: "TH12345678" })).status, 409);
  assert.equal((await patch(order.id, buyer, { status: "pickup_in_progress" })).status, 403);
  assert.equal((await patch(order.id, seller, { status: "ready_to_ship" })).status, 400);
  assert.equal((await patch(order.id, seller, { status: "pickup_in_progress" })).status, 400);
  const pickup = await patch(order.id, seller, { status: "pickup_in_progress", company: "Kerry", trackingNumber: "TH123456789TH" });
  assert.equal(pickup.status, 200, JSON.stringify(pickup.body));
  assert.equal(pickup.body.status, "pickup_in_progress");
  assert.equal(pickup.body.shipping.status, "pickup_in_progress");
  assert.equal(pickup.body.shippedAt, null);
  await lifecycle.deliverInTransitOrders(new Date(Date.now() + 60_000), scope);
  assert.equal((await prisma.order.findUnique({ where: { id: order.id } })).status, "pickup_in_progress");
  const shipped = await patch(order.id, seller, { status: "in_transit" });
  assert.equal(shipped.status, 200, JSON.stringify(shipped.body));
  assert.equal(shipped.body.status, "in_transit");
  assert.equal(shipped.body.shipping.status, "in_transit");
  assert.equal(shipped.body.shipping.company, "Kerry");
  assert.equal(shipped.body.shipping.trackingNumber, "TH123456789TH");
  assert.deepEqual(shipped.body.shipping.addressSnapshot, pickup.body.shipping.addressSnapshot);
  assert.ok(shipped.body.shippedAt);
  assert.equal((await patch(order.id, buyer, { status: "completed" })).status, 409);

  // Not yet 10 seconds after handoff: still in transit.
  await lifecycle.deliverInTransitOrders(new Date(), scope);
  let row = await prisma.order.findUnique({ where: { id: order.id }, include: { shipping: true } });
  assert.equal(row.status, "in_transit");

  await lifecycle.deliverInTransitOrders(new Date(Date.now() + 11_000), scope);
  row = await prisma.order.findUnique({ where: { id: order.id }, include: { shipping: true } });
  assert.equal(row.status, "delivered");
  assert.ok(row.deliveredAt);
  assert.equal(row.shipping.status, "delivered");

  assert.equal((await patch(order.id, seller, { status: "completed" })).status, 403);
  const done = await patch(order.id, buyer, { status: "completed" });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  assert.equal(done.body.status, "completed");
  assert.ok(done.body.completedAt);
  assert.ok(
    productStatuses.some((p) => p.productId === order.productId && p.status === "sold"),
  );
});

test("order lifecycle: delivered orders auto-complete after 14 days", async (t) => {
  if (!(await reachable(t))) return;
  const fresh = await paidOrder({ status: "delivered", deliveredAt: new Date() });
  const stale = await paidOrder({
    status: "delivered",
    deliveredAt: new Date(Date.now() - 14 * DAY - 1000),
  });
  await lifecycle.completeDeliveredOrders(new Date(), scope);
  const [freshRow, staleRow] = await Promise.all(
    [fresh, stale].map((o) => prisma.order.findUnique({ where: { id: o.id } })),
  );
  assert.equal(freshRow.status, "delivered");
  assert.equal(staleRow.status, "completed");
  assert.ok(staleRow.completedAt);
  const log = await prisma.orderLog.findFirst({
    where: { orderId: stale.id, action: "STATUS_CHANGED" },
  });
  assert.equal(log.actorId, "system");
});

test("order lifecycle: seller silence for a day expires, refunds and relists", async (t) => {
  if (!(await reachable(t))) return;
  const late = await paidOrder();
  await prisma.payment.updateMany({
    where: { orderId: late.id },
    data: { paidAt: new Date(Date.now() - DAY - 1000) },
  });
  const onTime = await paidOrder();
  await lifecycle.cancelUnconfirmedOrders(new Date(), scope);

  const lateRow = await prisma.order.findUnique({
    where: { id: late.id },
    include: { payments: true },
  });
  assert.equal(lateRow.status, "seller_confirmation_expired");
  await lifecycle.cancelUnconfirmedOrders(new Date(), scope);
  assert.equal(await prisma.payment.count({ where: { orderId: late.id, paymentType: "SIMULATED_REFUND" } }), 1);
  assert.ok(lateRow.payments.some((p) => p.paymentStatus === "refunded"));
  assert.ok(
    productStatuses.some((p) => p.productId === late.productId && p.status === "available"),
  );
  assert.equal(
    (await prisma.order.findUnique({ where: { id: onTime.id } })).status,
    "paid",
  );
});

test("order lifecycle: seller can reject a paid order immediately", async (t) => {
  if (!(await reachable(t))) return;
  const order = await paidOrder();
  const res = await patch(order.id, seller, { status: "cancelled" });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.status, "cancelled");
  assert.ok(res.body.payments.some((p) => p.paymentStatus === "refunded"));
});

test("order lifecycle: disputes open on delivered orders only inside the window", async (t) => {
  if (!(await reachable(t))) return;
  const open = (id) =>
    request(app)
      .post(`/${id}/disputes`)
      .set("Authorization", `Bearer ${buyer}`)
      .send({ reason: "not as described", disputeType: "ITEM_NOT_AS_DESCRIBED" });

  const shipped = await paidOrder({ status: "in_transit" });
  assert.equal((await open(shipped.id)).status, 400);

  const delivered = await paidOrder({ status: "delivered" });
  const res = await open(delivered.id);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const row = await prisma.order.findUnique({ where: { id: delivered.id } });
  assert.equal(row.status, "disputed");
  assert.equal(row.preDisputeStatus, "delivered");

  const expired = await paidOrder({
    status: "completed",
    deliveredAt: new Date(Date.now() - 15 * DAY),
    completedAt: new Date(Date.now() - DAY),
  });
  const late = await open(expired.id);
  assert.equal(late.status, 400);
  assert.match(late.body.error || late.body.message || "", /window/);
});
