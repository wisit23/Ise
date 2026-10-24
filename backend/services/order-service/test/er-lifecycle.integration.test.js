const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
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
  const buyerToken = token(buyerId, "BUYER");
  const previousAuthUrl = process.env.AUTH_SERVICE_URL;
  const addressApi = http.createServer((req, res) => {
    if (
      req.url !== "/me/addresses" ||
      req.headers.authorization !== `Bearer ${buyerToken}`
    ) {
      res.writeHead(403).end();
      return;
    }
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify(
        ["address1", "address2", "address3", "address4"].map((addressId) => ({
          ...ADDRESS,
          id: addressId,
          userId: buyerId,
          ...(addressId === "address2" ? { addressLine: "Second Road" } : {}),
        })),
      ),
    );
  });
  await new Promise((resolve) => addressApi.listen(0, "127.0.0.1", resolve));
  process.env.AUTH_SERVICE_URL = `http://127.0.0.1:${addressApi.address().port}`;
  t.after(async () => {
    await new Promise((resolve) => addressApi.close(resolve));
    if (previousAuthUrl === undefined) delete process.env.AUTH_SERVICE_URL;
    else process.env.AUTH_SERVICE_URL = previousAuthUrl;
  });
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
      shippingAddress: { ...ADDRESS, addressLine: "Untrusted client address" },
    });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(res.body.orders.every((o) => o.shipping.addressId === "address2"));
  assert.ok(
    res.body.orders.every(
      (o) => o.shipping.addressSnapshot.addressLine === "Second Road",
    ),
  );
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
  res = await request(app)
    .patch(`/${first.id}/shipping-address`)
    .set("Authorization", `Bearer ${buyerToken}`)
    .send({
      addressId: "address3",
      shippingAddress: { ...ADDRESS, addressLine: "Untrusted client address" },
    });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.addressId, "address3");
  assert.equal(res.body.addressSnapshot.addressLine, ADDRESS.addressLine);
  assert.equal(
    (await prisma.shipping.findUnique({ where: { orderId: second.id } }))
      .addressId,
    "address2",
  );
  // Shipping waits for the seller: paid -> confirmed -> ready_to_ship.
  let order = await prisma.order.findUnique({ where: { id: first.id } });
  await assert.rejects(
    shippingService.advanceShipping({
      orderId: first.id,
      actorId: "seller1",
      version: order.version,
      status: "in_transit",
      company: "Carrier",
      trackingNumber: "TRACK0000",
    }),
    (err) => err.status === 409,
  );
  for (const status of ["confirmed", "ready_to_ship", "pickup_in_progress"]) {
    res = await request(app)
      .patch(`/${first.id}/status`)
      .set("Authorization", `Bearer ${token("seller1", "BUYER")}`)
      .send({ status });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.status, status);
  }
  order = await prisma.order.findUnique({ where: { id: first.id } });
  await assert.rejects(
    shippingService.advanceShipping({
      orderId: first.id,
      actorId: "seller1",
      version: order.version,
      status: "in_transit",
      company: "",
      trackingNumber: "",
    }),
    (err) => err.status === 400,
  );
  await shippingService.advanceShipping({
    status: "in_transit",
    orderId: first.id,
    actorId: "seller1",
    version: order.version,
    company: "Carrier",
    trackingNumber: "TRACK0001",
  });
  await assert.rejects(
    shippingService.updateAddress({
      orderId: first.id,
      buyerId,
      addressId: "address4",
      shippingAddress: ADDRESS,
      authorization: `Bearer ${buyerToken}`,
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
      deliveredAt: new Date(),
      completedAt: new Date(),
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
test("auction callback retries one bid idempotently and creates a separate order for the next winning bid", async (t) => {
  t.mock.method(
    require("../src/services/authClient"),
    "getUser",
    async (id) => ({ id, status: "ACTIVE" }),
  );
  if (!(await available(t))) return;
  const body = {
    auctionId: id + "-auction",
    auctionBidId: id + "-bid",
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

  const mismatchedRetry = await request(app)
    .post("/internal/from-auction")
    .set("x-internal-token", process.env.INTERNAL_SERVICE_TOKEN)
    .send({ ...body, buyerId: buyerId + "-other" });
  assert.equal(mismatchedRetry.status, 409);

  const successor = await request(app)
    .post("/internal/from-auction")
    .set("x-internal-token", process.env.INTERNAL_SERVICE_TOKEN)
    .send({
      ...body,
      auctionBidId: id + "-bid-next",
      buyerId: buyerId + "-next",
      price: "900.00",
      previousOrderId: one.body.id,
    });
  assert.equal(successor.status, 201, JSON.stringify(successor.body));
  assert.notEqual(successor.body.id, one.body.id);
  assert.equal(successor.body.auctionId, body.auctionId);
  assert.equal(successor.body.auctionBidId, id + "-bid-next");
  assert.equal(
    await prisma.order.count({ where: { auctionId: body.auctionId } }),
    2,
  );
});
test.after(() => prisma.$disconnect());
