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
  async function expectQueue(access, scope, expected, assignedRole = "TRUST_AND_SAFETY") {
    const res = await request(app).get("/disputes/queue")
      .query({ q: order.id, scope, assignedRole, ...(scope === "history" ? { status: "DECIDED", sort: "newest" } : { work: "open" }) })
      .set("Authorization", `Bearer ${access}`);
    assert.equal(res.status, 200, res.text);
    assert.equal(res.body.items.some((item) => item.id === opened.body.id), expected, `${assignedRole}/${scope}`);
    assert.equal(res.body.total, expected ? 1 : 0);
  }
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
  assert.equal(escalated.body.escalationNote, memo.trim());
  await expectQueue(tsToken, "unassigned", true);
  await expectQueue(tsToken, "mine", false);
  // After escalation CS keeps watching the case but can no longer decide it.
  const watched = await request(app).get(path).set("Authorization", `Bearer ${csToken}`);
  assert.equal(watched.status, 200, watched.text);
  assert.ok(!watched.body.capabilities?.canDecide);
  let safety = await post("claim", tsToken, {
    version: escalated.body.version,
  });
  assert.equal(safety.status, 200, safety.text);
  await expectQueue(tsToken, "unassigned", false);
  await expectQueue(tsToken, "mine", true);
  const detail = await request(app)
    .get(path)
    .set("Authorization", `Bearer ${tsToken}`);
  assert.equal(detail.body.capabilities.canDecide, true);
  const returned = await post("request-evidence", tsToken, {
    version: safety.body.version,
    reason: "Need receipt",
    tasks: ["ขอใบเสร็จ", "ตรวจสอบรูปสินค้า"],
  });
  assert.equal(returned.status, 200, returned.text);
  assert.equal(returned.body.assignedTo, cs);
  assert.equal(returned.body.returnTasks.length, 2);
  await expectQueue(tsToken, "mine", false);
  await expectQueue(csToken, "mine", true, "CUSTOMER_SERVICE");
  const task = await request(app).patch(`${path}/return-tasks/${returned.body.returnTasks[0].id}`)
    .set("Authorization", `Bearer ${csToken}`).send({ done: true, note: "ได้รับใบเสร็จแล้ว" });
  assert.equal(task.status, 200, task.text);
  assert.equal(task.body.returnTasks[0].done, true);
  const again = await post("escalate", csToken, {
    version: returned.body.version,
    reason: memo,
  });
  assert.equal(again.status, 200, again.text);
  assert.equal(again.body.returnedAt, null);
  assert.equal(again.body.returnTasks[0].done, true);
  assert.equal(again.body.returnTasks[0].note, "ได้รับใบเสร็จแล้ว");
  await expectQueue(tsToken, "unassigned", true);
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
  const closedQueue = await request(app).get("/disputes/queue").query({ scope: "closed", q: order.id }).set("Authorization", `Bearer ${csToken}`);
  assert.equal(closedQueue.status, 200, closedQueue.text);
  assert.equal(closedQueue.body.items[0].capabilities.canViewDetail, true);
  const csHistory = await request(app).get(path).set("Authorization", `Bearer ${csToken}`);
  assert.equal(csHistory.status, 200, csHistory.text);
  assert.equal(csHistory.body.capabilities.isHistoryViewer, true);
  assert.equal(csHistory.body.capabilities.canReply, false);
  t.mock.method(chat, "joinDisputeConversation", async () => "history-room");
  const historyRoom = await post("conversation", csToken, { side: "buyer" });
  assert.equal(historyRoom.status, 200, historyRoom.text);
  assert.equal(historyRoom.body.readOnly, true);
  const otherCsToken = token(`other-cs-${suffix}`, "CUSTOMER_SERVICE");
  assert.equal((await request(app).get(path).set("Authorization", `Bearer ${otherCsToken}`)).status, 403);
  assert.equal((await post("request-evidence", csToken, { version: decided.body.version, reason: "not allowed" })).status, 403);
  await expectQueue(tsToken, "mine", false);
  await expectQueue(tsToken, "history", true);
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
