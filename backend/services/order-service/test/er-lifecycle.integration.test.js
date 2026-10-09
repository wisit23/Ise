const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.INTERNAL_SERVICE_TOKEN ||= "test-internal-token";
const prisma = require("../src/models/prismaClient");
const app = require("../src/app");
app.locals.validateAccessSession = async () => {};
const { signAccessToken, permissionsForRoles } = require("@reloop/shared");
const products = require("../src/services/productClient");
products.extendProductReservation = async () => {};
products.completeProductReservation = async () => {};
products.setProductStatus = async () => {};
products.completeVoucher = async () => {};
const activities = require("../src/services/buyerActivityClient");
activities.recordOrderActivity = async () => true;
const { ADDRESS } = require("./fixtures");
const checkoutService = require("../src/features/checkoutSessions/checkoutSessionService");
const disputeService = require("../src/features/disputes/disputeService");
const shippingService =
  require("../src/features/shipping/shippingService").createShippingService(
    prisma,
  );
const id = "er-test-" + Date.now();
const buyerId = id + "-buyer";
const staffId = id + "-cs";
const token = (sub, role) =>
  signAccessToken({
    sub,
    role,
    roles: [role],
    permissions: permissionsForRoles([role]),
  });
async function available(t) {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    if (process.env.REQUIRE_INTEGRATION === "1") throw error;
    t.skip("disposable PostgreSQL required");
    return false;
  }
}
test("ER checkout API: multiple sellers, exact totals, immutable paidAt, address snapshots and shipment guards", async (t) => {
  if (!(await available(t))) return;
  const first = await prisma.order.create({
    data: {
      buyerId,
      sellerId: "seller1",
      productId: id + "-p1",
      orderType: "BUY_NOW",
      originalAmount: "1000.50",
      ordersAmount: "900.25",
      basket: {
        create: {
          buyerId,
          productId: id + "-p1",
          status: "locked",
          lockAt: new Date(),
          unlockAt: new Date(Date.now() + 60000),
        },
      },
    },
  });
  const second = await prisma.order.create({
    data: {
      buyerId,
      sellerId: "seller2",
      productId: id + "-p2",
      orderType: "AUCTION",
      originalAmount: "500.25",
      ordersAmount: "500.25",
    },
  });
  const buyerToken = token(buyerId, "BUYER");
  let res = await request(app)
    .post("/checkouts")
    .set("Authorization", "Bearer " + buyerToken)
    .send({
      orderIds: [first.id, second.id],
      addressId: "address1",
      shippingAddress: ADDRESS,
    });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const checkoutId = res.body.id;
  assert.equal(res.body.ordersAmount, "1400.5");
  assert.equal(res.body.paidAt, null);
  res = await request(app)
    .patch("/checkouts/" + checkoutId + "/address")
    .set("Authorization", "Bearer " + buyerToken)
    .send({
      addressId: "address2",
      shippingAddress: { ...ADDRESS, addressLine: "Second Road" },
    });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(res.body.orders.every((o) => o.shipping.addressId === "address2"));
  const paid = await checkoutService.confirm({
    buyerId,
    sessionId: checkoutId,
  });
  assert.equal(paid.status, "paid");
  assert.ok(paid.paidAt);
  const retry = await checkoutService.confirm({
    buyerId,
    sessionId: checkoutId,
  });
  assert.equal(retry.paidAt.getTime(), paid.paidAt.getTime());
  assert.equal(
    await prisma.payment.count({
      where: { orderId: { in: [first.id, second.id] } },
    }),
    2,
  );
  await shippingService.updateAddress({
    orderId: first.id,
    buyerId,
    addressId: "address3",
    shippingAddress: ADDRESS,
  });
  assert.equal(
    (await prisma.shipping.findUnique({ where: { orderId: second.id } }))
      .addressId,
    "address2",
  );
  let order = await prisma.order.findUnique({ where: { id: first.id } });
  await assert.rejects(
    shippingService.markShipped({
      orderId: first.id,
      actorId: "seller1",
      version: order.version,
      company: "",
      trackingNumber: "",
    }),
    (err) => err.status === 400,
  );
  await shippingService.markShipped({
    orderId: first.id,
    actorId: "seller1",
    version: order.version,
    company: "Carrier",
    trackingNumber: "TRACK-1",
  });
  await assert.rejects(
    shippingService.updateAddress({
      orderId: first.id,
      buyerId,
      addressId: "address4",
      shippingAddress: ADDRESS,
    }),
    (err) => err.status === 409,
  );
  await assert.rejects(
    prisma.shipping.create({
      data: {
        orderId: first.id,
        addressId: "another",
        addressSnapshot: ADDRESS,
        status: "pending",
      },
    }),
    (err) => err.code === "P2002",
  );
});
test("ER evidence API: buyer uploads before claim, staff chooses deadline, audits isolate evidence and safety review stays unique", async (t) => {
  if (!(await available(t))) return;
  const order = await prisma.order.create({
    data: {
      buyerId,
      sellerId: "seller3",
      productId: id + "-p3",
      orderType: "BUY_NOW",
      originalAmount: "99.99",
      ordersAmount: "99.99",
      status: "completed",
      payments: {
        create: {
          paymentType: "TEST",
          paymentStatus: "paid",
          paymentAmount: "99.99",
          paidAt: new Date(),
        },
      },
    },
  });
  let dispute = await disputeService.open({
    orderId: order.id,
    userId: buyerId,
    reason: "Damage",
    disputeType: "DAMAGED_ITEM",
  });
  const evidence = await disputeService.addEvidence({
    disputeId: dispute.id,
    userId: buyerId,
    role: "BUYER",
    file: { filename: "er-damage.jpg", mimetype: "image/jpeg" },
  });
  assert.equal(evidence.evidenceDeadline, null);
  const another = await disputeService.addEvidence({
    disputeId: dispute.id,
    userId: buyerId,
    role: "BUYER",
    file: { filename: "er-label.jpg", mimetype: "image/jpeg" },
  });
  dispute = await prisma.disputeCase.findUnique({ where: { id: dispute.id } });
  await disputeService.claim({
    disputeId: dispute.id,
    userId: staffId,
    role: "CUSTOMER_SERVICE",
    version: dispute.version,
  });
  const deadline = new Date(Date.now() + 86400000).toISOString();
  const route =
    "/disputes/" + dispute.id + "/evidence/" + evidence.id + "/deadline";
  const staffToken = token(staffId, "CUSTOMER_SERVICE");
  let res = await request(app)
    .patch(route)
    .set("Authorization", "Bearer " + token(buyerId, "BUYER"))
    .send({ deadline, version: 0 });
  assert.equal(res.status, 403);
  res = await request(app)
    .patch(route)
    .set("Authorization", "Bearer " + staffToken)
    .send({ deadline, version: 0 });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.evidenceDeadline, deadline);
  res = await request(app)
    .patch(route)
    .set("Authorization", "Bearer " + staffToken)
    .send({ deadline, version: 0 });
  assert.equal(res.status, 409);
  const verifyRoute =
    "/admin/" + order.id + "/evidence/" + evidence.id + "/verify";
  const tsToken = token(id + "-ts", "TRUST_AND_SAFETY");
  for (const version of [1, 2]) {
    res = await request(app)
      .patch(verifyRoute)
      .set("Authorization", "Bearer " + tsToken)
      .send({ version, status: "VERIFIED", detail: "Checked damage evidence" });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.verifyAt);
    assert.equal(res.body.verifyBy, id + "-ts");
  }
  assert.equal(
    await prisma.safetyDisputeEvidence.count({
      where: { evidenceId: evidence.id },
    }),
    1,
  );
  assert.equal(
    await prisma.safetyLog.count({
      where: { safety: { evidenceId: evidence.id } },
    }),
    2,
  );
  assert.equal(
    await prisma.disputeAuditLog.count({
      where: { disputeEvidenceId: another.id },
    }),
    1,
  );
  assert.equal(
    (await prisma.disputeEvidence.findUnique({ where: { id: another.id } }))
      .evidenceDeadline,
    null,
  );
  await assert.rejects(
    prisma.disputeCase.create({
      data: {
        orderId: order.id,
        createdBy: buyerId,
        reason: "Another",
        disputeType: "DAMAGED_ITEM",
      },
    }),
    (err) => err.code === "P2002",
  );
});
test("auction callback retries create one pending order and no basket", async (t) => {
  if (!(await available(t))) return;
  const body = {
    auctionId: id + "-auction",
    productId: id + "-auction-product",
    buyerId,
    sellerId: "auction-seller",
    price: "1250.75",
  };
  const one = await request(app)
    .post("/internal/from-auction")
    .set("x-internal-token", process.env.INTERNAL_SERVICE_TOKEN)
    .send(body);
  assert.equal(one.status, 201, JSON.stringify(one.body));
  const two = await request(app)
    .post("/internal/from-auction")
    .set("x-internal-token", process.env.INTERNAL_SERVICE_TOKEN)
    .send(body);
  assert.equal(two.status, 200);
  assert.equal(two.body.id, one.body.id);
  assert.equal(one.body.basketId, null);
  assert.equal(one.body.status, "pending_payment");
  assert.equal(one.body.originalAmount, "1250.75");
});
test.after(() => prisma.$disconnect());
