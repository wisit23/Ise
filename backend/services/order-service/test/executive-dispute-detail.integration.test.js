// Integration test against a real, disposable Postgres database (reloop_order).
// Skips cleanly when DATABASE_URL is unset/unreachable; set REQUIRE_INTEGRATION=1
// to turn that skip into a hard failure instead.
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const request = require("supertest");

process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";
process.env.INTERNAL_SERVICE_TOKEN ||= "dispute-detail-internal-token";
if (process.env.DATABASE_URL_ORDER) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_ORDER;
}

const { signAccessToken } = require("@reloop/shared");
const prisma = require("../src/models/prismaClient");
const app = require("../src/app");
// This feature suite uses signed identity fixtures; live session enforcement
// is covered separately by account-suspension.integration.test.js.
app.locals.validateAccessSession = async () => {};

async function databaseIsReachable() {
  if (!process.env.DATABASE_URL) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

/** A stand-in for another service: answers with `handler(req, body)`. */
async function fakeService(handler) {
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const { status, json } = handler(req, body);
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(json));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

test("executive dispute detail against a real database", async (t) => {
  if (!(await databaseIsReachable())) {
    const message = "DATABASE_URL not set or database unreachable";
    if (process.env.REQUIRE_INTEGRATION === "1") {
      throw new Error(`REQUIRE_INTEGRATION=1 but ${message}`);
    }
    t.skip(message);
    return;
  }

  const runId = Date.now();
  const ids = {
    buyer: `exec-dd-buyer-${runId}`,
    seller: `exec-dd-seller-${runId}`,
    admin: `exec-dd-admin-${runId}`,
    order: `exec-dd-order-${runId}`,
    product: `exec-dd-product-${runId}`,
  };
  const executiveToken = signAccessToken({
    sub: "int-test-executive",
    role: "EXECUTIVE",
    displayName: "Trusted Integration Executive",
  });
  const buyerToken = signAccessToken({ sub: ids.buyer, role: "BUYER" });

  const nameAsks = [];
  const auth = await fakeService((req, body) => {
    if (req.url === "/internal/reference-codes")
      return { status: 200, json: {} };
    nameAsks.push({
      url: req.url,
      token: req.headers["x-internal-token"],
      body: JSON.parse(body || "{}"),
    });
    return {
      status: 200,
      json: [
        { userId: ids.buyer, displayName: "มาลี" },
        { userId: ids.seller, displayName: "ร้านมือสองดี" },
        {
          userId: ids.admin,
          displayName: "แอดมินเอ",
          staffRoles: ["ADMIN"],
        },
      ],
    };
  });
  const products = await fakeService((req) => ({
    status: req.url === `/${ids.product}` ? 200 : 404,
    json: { id: ids.product, title: "กระเป๋าหนังวินเทจ" },
  }));
  const previous = {
    auth: process.env.AUTH_SERVICE_URL,
    product: process.env.PRODUCT_SERVICE_URL,
  };
  process.env.AUTH_SERVICE_URL = auth.url;
  process.env.PRODUCT_SERVICE_URL = products.url;
  let closed = false;

  try {
    const order = await prisma.order.create({
      data: {
        id: ids.order,
        buyerId: ids.buyer,
        sellerId: ids.seller,
        productId: ids.product,
        originalAmount: 1200,
        ordersAmount: 1000,
        orderType: "BUY_NOW",
        status: "disputed",
        createdAt: new Date("2001-07-10T05:00:00.000Z"),
      },
    });
    const dispute = await prisma.disputeCase.create({
      data: {
        id: `d-${ids.order}`,
        orderId: ids.order,
        createdBy: ids.buyer,
        reason: "ได้รับของไม่ตรงปก",
        disputeType: "ITEM_NOT_AS_DESCRIBED",
        status: "DECIDED",
        priority: "HIGH",
        assignedTo: ids.admin,
        assignedRole: "ADMIN",
        assignedAt: new Date("2001-07-10T06:00:00.000Z"),
        decision: "APPROVE_REFUND",
        decisionReason: "รูปที่ส่งยืนยันว่าสินค้าไม่ตรง",
        decidedBy: ids.admin,
        decidedAt: new Date("2001-07-11T03:00:00.000Z"),
        decisionDueAt: new Date("2001-07-12T05:00:00.000Z"),
        createdAt: new Date("2001-07-10T05:00:00.000Z"),
      },
    });

    const get = (id, token = executiveToken) =>
      request(app)
        .get(`/executive/disputes/${id}`)
        .set("Authorization", `Bearer ${token}`);

    const res = await get(dispute.id);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, {
      id: dispute.id,
      referenceCode: dispute.referenceCode,
      displayReferences: {
        [dispute.id]: dispute.referenceCode,
        [order.id]: order.referenceCode,
      },
      reason: "ได้รับของไม่ตรงปก",
      disputeType: "ITEM_NOT_AS_DESCRIBED",
      status: "DECIDED",
      priority: "HIGH",
      createdAt: "2001-07-10T05:00:00.000Z",
      order: {
        id: ids.order,
        amount: 1000,
        orderType: "BUY_NOW",
        referenceCode: order.referenceCode,
        displayReferences: { [order.id]: order.referenceCode },
      },
      product: { id: ids.product, title: "กระเป๋าหนังวินเทจ" },
      buyer: { id: ids.buyer, name: "มาลี" },
      seller: { id: ids.seller, name: "ร้านมือสองดี" },
      assignee: { id: ids.admin, name: "แอดมินเอ", roles: ["ADMIN"] },
      assignedRole: "ADMIN",
      assignedAt: "2001-07-10T06:00:00.000Z",
      decision: "APPROVE_REFUND",
      decisionReason: "รูปที่ส่งยืนยันว่าสินค้าไม่ตรง",
      decider: { id: ids.admin, name: "แอดมินเอ", roles: ["ADMIN"] },
      decidedAt: "2001-07-11T03:00:00.000Z",
      decisionDueAt: "2001-07-12T05:00:00.000Z",
    });
    assert.equal(res.body.meta.namesAvailable, true);
    assert.equal(res.body.meta.productAvailable, true);
    // Names are asked of auth-service once, in a batch, with the service token.
    assert.equal(nameAsks.length, 1);
    assert.equal(nameAsks[0].url, "/internal/users/display-names");
    assert.equal(nameAsks[0].token, process.env.INTERNAL_SERVICE_TOKEN);
    assert.deepEqual(
      [...nameAsks[0].body.userIds].sort(),
      [ids.admin, ids.buyer, ids.seller].sort(),
    );
    // Evidence and chat never come back.
    assert.equal(res.body.data.evidence, undefined);
    assert.equal(res.body.data.caseLog, undefined);

    // auth-service and product-service down: the ids still come back, and
    // meta says what is missing.
    await auth.close();
    await products.close();
    closed = true;
    const down = await get(dispute.id);
    assert.equal(down.status, 200);
    assert.deepEqual(down.body.data.buyer, { id: ids.buyer, name: null });
    assert.equal(down.body.data.product.title, null);
    assert.equal(down.body.meta.namesAvailable, false);
    assert.equal(down.body.meta.productAvailable, false);

    assert.equal((await get("no-such-dispute")).status, 404);
    assert.equal((await get(dispute.id, buyerToken)).status, 403);
    assert.equal(
      (await request(app).get(`/executive/disputes/${dispute.id}`)).status,
      401,
    );
  } finally {
    if (!closed) {
      await auth.close();
      await products.close();
    }
    if (previous.auth === undefined) delete process.env.AUTH_SERVICE_URL;
    else process.env.AUTH_SERVICE_URL = previous.auth;
    if (previous.product === undefined) delete process.env.PRODUCT_SERVICE_URL;
    else process.env.PRODUCT_SERVICE_URL = previous.product;
    await prisma.disputeCase.deleteMany({ where: { orderId: ids.order } });
    await prisma.order.deleteMany({ where: { id: ids.order } });
    await prisma.$disconnect();
  }
});
