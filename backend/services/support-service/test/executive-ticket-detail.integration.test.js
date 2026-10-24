// Integration test against a real, disposable Postgres database (reloop_support).
// Skips cleanly when DATABASE_URL is unset/unreachable; set REQUIRE_INTEGRATION=1
// to turn that skip into a hard failure instead.
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const request = require("supertest");

process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";
process.env.INTERNAL_SERVICE_TOKEN ||= "ticket-detail-internal-token";
if (process.env.DATABASE_URL_SUPPORT) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_SUPPORT;
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

test("executive ticket detail against a real database", async (t) => {
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
    requester: `exec-td-buyer-${runId}`,
    agentA: `exec-td-agent-a-${runId}`,
    agentB: `exec-td-agent-b-${runId}`,
  };
  const executiveToken = signAccessToken({
    sub: "int-test-executive",
    role: "EXECUTIVE",
    displayName: "Trusted Integration Executive",
  });
  const buyerToken = signAccessToken({ sub: ids.requester, role: "BUYER" });

  // A stand-in auth-service that names everyone it is asked about.
  const asked = [];
  const auth = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      asked.push({ url: req.url, body: JSON.parse(body || "{}") });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify([
          { userId: ids.requester, displayName: "มาลี", staffRoles: [] },
          {
            userId: ids.agentA,
            displayName: "เจ้าหน้าที่เอ",
            staffRoles: ["CUSTOMER_SERVICE"],
          },
          {
            userId: ids.agentB,
            displayName: "เจ้าหน้าที่บี",
            staffRoles: ["TRUST_AND_SAFETY"],
          },
        ]),
      );
    });
  });
  await new Promise((resolve) => auth.listen(0, "127.0.0.1", resolve));
  const previousAuth = process.env.AUTH_SERVICE_URL;
  process.env.AUTH_SERVICE_URL = `http://127.0.0.1:${auth.address().port}`;
  let closed = false;

  // The order the ticket names, as order-service would describe it.
  const orderClient = require("../src/services/orderClient");
  const realGetOrder = orderClient.getOrder;
  let orderAnswer = async (orderId) => ({
    id: orderId,
    productId: `product-${runId}`,
    productTitle: "กระเป๋าหนังวินเทจ",
  });
  orderClient.getOrder = (orderId) => orderAnswer(orderId);

  const statusId = async (code) =>
    (await prisma.ticketStatus.findUniqueOrThrow({ where: { code } })).id;
  let ticketId;
  let openTicketId;

  try {
    const ticket = await prisma.supportTicket.create({
      data: {
        requesterId: ids.requester,
        subject: `exec detail ${runId}`,
        description: "จ่ายเงินแล้วสถานะยังไม่เปลี่ยน",
        orderId: `order-${runId}`,
        categoryId: (
          await prisma.ticketCategory.findUniqueOrThrow({
            where: { code: "PAYMENT" },
          })
        ).id,
        priorityId: (
          await prisma.ticketPriority.findUniqueOrThrow({
            where: { code: "HIGH" },
          })
        ).id,
        currentStatusId: await statusId("RESOLVED"),
        createdAt: new Date("2001-05-10T05:00:00.000Z"),
      },
    });
    ticketId = ticket.id;
    // Agent A had it first, then handed it to agent B, who has it now.
    await prisma.ticketAssignment.create({
      data: {
        ticketId,
        assigneeId: ids.agentA,
        assignedById: ids.agentA,
        assignedAt: new Date("2001-05-10T06:00:00.000Z"),
        endedAt: new Date("2001-05-10T07:00:00.000Z"),
        endReason: "handover",
      },
    });
    await prisma.ticketAssignment.create({
      data: {
        ticketId,
        assigneeId: ids.agentB,
        assignedById: ids.agentA,
        assignedAt: new Date("2001-05-10T07:00:00.000Z"),
      },
    });
    await prisma.ticketStatusHistory.createMany({
      data: [
        {
          ticketId,
          fromStatusId: await statusId("NEW"),
          toStatusId: await statusId("IN_PROGRESS"),
          changedById: ids.agentA,
          reason: null,
          createdAt: new Date("2001-05-10T06:30:00.000Z"),
        },
        {
          ticketId,
          fromStatusId: await statusId("IN_PROGRESS"),
          toStatusId: await statusId("RESOLVED"),
          changedById: ids.agentB,
          reason: "คืนเงินผ่านระบบแล้ว",
          createdAt: new Date("2001-05-10T09:00:00.000Z"),
        },
      ],
    });

    const get = (id, token = executiveToken) =>
      request(app)
        .get(`/executive/tickets/${id}`)
        .set("Authorization", `Bearer ${token}`);

    const res = await get(ticketId);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, {
      id: ticketId,
      ticketNumber: res.body.data.ticketNumber,
      subject: `exec detail ${runId}`,
      requester: { id: ids.requester, name: "มาลี" },
      createdAt: "2001-05-10T05:00:00.000Z",
      orderId: `order-${runId}`,
      product: { id: `product-${runId}`, title: "กระเป๋าหนังวินเทจ" },
      status: { code: "RESOLVED", name: "RESOLVED" },
      // The one who has it now.
      assignee: {
        id: ids.agentB,
        name: "เจ้าหน้าที่บี",
        roles: ["TRUST_AND_SAFETY"],
        assignedAt: "2001-05-10T07:00:00.000Z",
        current: true,
      },
      // Who dealt with it, as what, with what outcome and why.
      handling: {
        by: {
          id: ids.agentB,
          name: "เจ้าหน้าที่บี",
          roles: ["TRUST_AND_SAFETY"],
        },
        at: "2001-05-10T09:00:00.000Z",
        outcome: "RESOLVED",
        reason: "คืนเงินผ่านระบบแล้ว",
      },
    });
    assert.equal(res.body.meta.namesAvailable, true);
    assert.equal(res.body.meta.productAvailable, true);
    assert.equal(asked.length, 1);
    assert.equal(asked[0].url, "/internal/users/display-names");
    assert.deepEqual(
      [...asked[0].body.userIds].sort(),
      [ids.requester, ids.agentB].sort(),
    );
    // The ticket text, chat and notes never come back.
    assert.equal(res.body.data.description, undefined);

    // order-service down: the order id stays, the product is unknown.
    orderAnswer = async () => {
      throw new Error("order-service unreachable");
    };
    const noOrder = await get(ticketId);
    assert.equal(noOrder.body.data.product, null);
    assert.equal(noOrder.body.meta.productAvailable, false);

    // A ticket nobody has closed yet has no handling.
    const open = await prisma.supportTicket.create({
      data: {
        requesterId: ids.requester,
        subject: `exec open ${runId}`,
        categoryId: (
          await prisma.ticketCategory.findUniqueOrThrow({
            where: { code: "ORDER" },
          })
        ).id,
        priorityId: (
          await prisma.ticketPriority.findUniqueOrThrow({
            where: { code: "LOW" },
          })
        ).id,
        currentStatusId: await statusId("NEW"),
      },
    });
    openTicketId = open.id;
    const openRes = await get(open.id);
    assert.equal(openRes.status, 200);
    assert.equal(openRes.body.data.assignee, null);
    assert.equal(openRes.body.data.handling, null);
    // No order on the ticket: no product, and order-service is not asked.
    assert.equal(openRes.body.data.orderId, null);
    assert.equal(openRes.body.data.product, null);
    assert.equal(openRes.body.meta.productAvailable, true);

    // auth-service down: ids still, and meta says the names are missing.
    await new Promise((resolve) => auth.close(() => resolve()));
    closed = true;
    const down = await get(ticketId);
    assert.equal(down.status, 200);
    assert.deepEqual(down.body.data.handling.by, {
      id: ids.agentB,
      name: null,
      roles: [],
    });
    assert.equal(down.body.meta.namesAvailable, false);

    // Reopened after RESOLVED: being worked on again, so no old outcome.
    await prisma.ticketStatusHistory.create({
      data: {
        ticketId,
        fromStatusId: await statusId("RESOLVED"),
        toStatusId: await statusId("IN_PROGRESS"),
        changedById: ids.agentB,
        createdAt: new Date("2001-05-11T09:00:00.000Z"),
      },
    });
    await prisma.supportTicket.update({
      where: { id: ticketId },
      data: { currentStatusId: await statusId("IN_PROGRESS") },
    });
    const reopened = await get(ticketId);
    assert.equal(reopened.body.data.status.code, "IN_PROGRESS");
    assert.equal(reopened.body.data.handling, null);

    assert.equal((await get("no-such-ticket")).status, 404);
    assert.equal((await get(ticketId, buyerToken)).status, 403);
    assert.equal(
      (await request(app).get(`/executive/tickets/${ticketId}`)).status,
      401,
    );
  } finally {
    orderClient.getOrder = realGetOrder;
    if (!closed) await new Promise((resolve) => auth.close(() => resolve()));
    if (previousAuth === undefined) delete process.env.AUTH_SERVICE_URL;
    else process.env.AUTH_SERVICE_URL = previousAuth;
    await prisma.supportTicket.deleteMany({
      where: { id: { in: [ticketId, openTicketId].filter(Boolean) } },
    });
    await prisma.$disconnect();
  }
});
