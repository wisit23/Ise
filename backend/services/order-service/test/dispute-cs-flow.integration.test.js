const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { createOrder, deleteOrder } = require("./fixtures");
const { signAccessToken, permissionsForRoles } = require("@reloop/shared");
const prisma = require("../src/models/prismaClient");
const { Prisma } = require("../src/generated/prisma-client");
const app = require("../src/app");
const auth = require("../src/services/authClient");
const chat = require("../src/services/chatClient");
const { sweepCaseRetention } = require("@reloop/shared/src/caseRetention");

test("CS investigates, T&S requests information and decides, expired disputes are soft deleted", async (t) => {
  const raw = process.env.DATABASE_URL_ORDER;
  if (
    !raw ||
    !["127.0.0.1", "localhost"].includes(new URL(raw).hostname) ||
    !/^\/reloop_ci_[a-z0-9_]+$/.test(new URL(raw).pathname)
  ) {
    if (process.env.REQUIRE_INTEGRATION === "1")
      throw new Error("Disposable DATABASE_URL_ORDER required");
    t.skip("Set disposable DATABASE_URL_ORDER");
    return;
  }
  process.env.JWT_ACCESS_SECRET ||= "cs-flow-test-secret";
  app.locals.validateAccessSession = async () => {};
  const suffix = Date.now();
  const cs = `flow-cs-${suffix}`,
    ts = `flow-ts-${suffix}`,
    buyer = `flow-buyer-${suffix}`;
  t.mock.method(auth, "getUser", async (id) => ({
    id,
    status: "ACTIVE",
    roles: [id === ts ? "TRUST_AND_SAFETY" : "CUSTOMER_SERVICE"],
    reportCount: 0,
  }));
  t.mock.method(chat, "sendDisputeNotice", async () => {});
  t.mock.method(chat, "lockDisputeConversation", async () => {});
  t.mock.method(global, "fetch", async () => ({
    ok: true,
    json: async () => ({ names: {} }),
  }));
  const order = await createOrder(prisma, {
    data: {
      buyerId: buyer,
      sellerId: `seller-${suffix}`,
      productId: `product-${suffix}`,
      originalAmount: 100,
      ordersAmount: 100,
      orderType: "BUY_NOW",
      status: "completed",
    },
  });
  t.after(async () => {
    await deleteOrder(prisma, order.id);
    await prisma.$disconnect();
  });
  const token = (id, role) =>
    signAccessToken({
      sub: id,
      role,
      roles: [role],
      permissions: permissionsForRoles([role]),
    });
  const csToken = token(cs, "CUSTOMER_SERVICE"),
    tsToken = token(ts, "TRUST_AND_SAFETY"),
    buyerToken = token(buyer, "BUYER");
  const opened = await request(app)
    .post(`/${order.id}/disputes`)
    .set("Authorization", `Bearer ${buyerToken}`)
    .send({ disputeType: "ITEM_NOT_AS_DESCRIBED", reason: "wrong item" });
  assert.equal(opened.status, 201, opened.text);
  const path = `/disputes/${opened.body.id}`;
  const post = (action, access, data) =>
    request(app)
      .post(`${path}/${action}`)
      .set("Authorization", `Bearer ${access}`)
      .send(data);
  const claimed = await post("claim", csToken, {
    version: opened.body.version,
  });
  assert.equal(claimed.status, 200, claimed.text);
  assert.equal(
    (
      await post("reassign", csToken, {
        version: claimed.body.version,
        toUserId: cs,
        reason: "self",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await post("decision", csToken, {
        version: claimed.body.version,
        decision: "REJECT",
        reason: "test",
        idempotencyKey: "cs-denied",
      })
    ).status,
    403,
  );
  const memo = "ปัญหา: wrong item\nขาดอำนาจ: refund\nข้อเสนอแนะ: ";
  const escalated = await post("escalate", csToken, {
    version: claimed.body.version,
    reason: memo,
  });
  assert.equal(escalated.status, 200, escalated.text);
  assert.equal(escalated.body.assignedRole, "TRUST_AND_SAFETY");
  assert.equal(
    (await request(app).get(path).set("Authorization", `Bearer ${csToken}`))
      .status,
    403,
  );
  let safety = await post("claim", tsToken, {
    version: escalated.body.version,
  });
  assert.equal(safety.status, 200, safety.text);
  const detail = await request(app)
    .get(path)
    .set("Authorization", `Bearer ${tsToken}`);
  assert.equal(detail.body.capabilities.canDecide, true);
  const returned = await post("request-evidence", tsToken, {
    version: safety.body.version,
    reason: "Need receipt",
  });
  assert.equal(returned.status, 200, returned.text);
  assert.equal(returned.body.assignedTo, cs);
  const again = await post("escalate", csToken, {
    version: returned.body.version,
    reason: memo,
  });
  assert.equal(again.status, 200, again.text);
  safety = await post("claim", tsToken, { version: again.body.version });
  assert.equal(safety.status, 200, safety.text);
  const verdict = {
    version: safety.body.version,
    decision: "APPROVE_REFUND",
    reason: "Evidence verified",
    idempotencyKey: `verdict-${suffix}`,
  };
  const decided = await post("decision", tsToken, verdict);
  assert.equal(decided.status, 200, decided.text);
  assert.equal(decided.body.status, "DECIDED");
  assert.equal(
    (await post("decision", tsToken, verdict)).status,
    200,
    "same verdict is idempotent",
  );
  const future = new Date(decided.body.decidedAt);
  future.setUTCFullYear(future.getUTCFullYear() + 5);
  await sweepCaseRetention(prisma, Prisma, "disputes", future);
  assert.ok(
    (await prisma.disputeCase.findUnique({ where: { id: opened.body.id } }))
      .deletedAt,
  );
  assert.equal(
    (await request(app).get(path).set("Authorization", `Bearer ${buyerToken}`))
      .status,
    404,
  );
  assert.equal(
    (await request(app).get(path).set("Authorization", `Bearer ${tsToken}`))
      .status,
    200,
  );
  const deleted = await request(app)
    .get("/disputes/queue?scope=all&retention=deleted")
    .set("Authorization", `Bearer ${tsToken}`);
  assert.equal(deleted.status, 200, deleted.text);
  assert.ok(deleted.body.items.some((row) => row.id === opened.body.id));
});
