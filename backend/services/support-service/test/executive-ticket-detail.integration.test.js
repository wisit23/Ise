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
      if (req.url === "/internal/reference-codes") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end("{}");
        return;
      }
      asked.push({ url: req.url, body: JSON.parse(body || "{}") });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify([
          { userId: ids.requester, displayName: "มาลี" },
          { userId: ids.agentA, displayName: "เจ้าหน้าที่เอ" },
          { userId: ids.agentB, displayName: "เจ้าหน้าที่บี" },
        ]),
      );
    });
  });
  await new Promise((resolve) => auth.listen(0, "127.0.0.1", resolve));
  const previousAuth = process.env.AUTH_SERVICE_URL;
  process.env.AUTH_SERVICE_URL = `http://127.0.0.1:${auth.address().port}`;
  let closed = false;

  const statusId = async (code) =>
    (await prisma.ticketStatus.findUniqueOrThrow({ where: { code } })).id;
  let ticketId;

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
    const data = res.body.data;
    assert.equal(data.subject, `exec detail ${runId}`);
    assert.equal(data.description, "จ่ายเงินแล้วสถานะยังไม่เปลี่ยน");
    assert.deepEqual(data.requester, { id: ids.requester, name: "มาลี" });
    assert.deepEqual(data.category, { code: "PAYMENT", name: "การชำระเงิน" });
    assert.equal(data.status.code, "RESOLVED");
    assert.equal(data.orderId, `order-${runId}`);
    // The one who has it now.
    assert.deepEqual(data.assignee, {
      id: ids.agentB,
      name: "เจ้าหน้าที่บี",
      assignedAt: "2001-05-10T07:00:00.000Z",
      current: true,
    });
    // Every status change, oldest first, with who and why.
    assert.deepEqual(data.actions, [
      {
        at: "2001-05-10T06:30:00.000Z",
        by: { id: ids.agentA, name: "เจ้าหน้าที่เอ" },
        from: "NEW",
        to: "IN_PROGRESS",
        reason: null,
      },
      {
        at: "2001-05-10T09:00:00.000Z",
        by: { id: ids.agentB, name: "เจ้าหน้าที่บี" },
        from: "IN_PROGRESS",
        to: "RESOLVED",
        reason: "คืนเงินผ่านระบบแล้ว",
      },
    ]);
    assert.equal(res.body.meta.namesAvailable, true);
    assert.equal(asked.length, 1);
    assert.equal(asked[0].url, "/internal/users/display-names");
    // Chat and notes never come back.
    assert.equal(data.chatLink, undefined);
    assert.equal(data.auditLog, undefined);

    // auth-service down: ids still, and meta says the names are missing.
    await new Promise((resolve) => auth.close(() => resolve()));
    closed = true;
    const down = await get(ticketId);
    assert.equal(down.status, 200);
    assert.deepEqual(down.body.data.requester, {
      id: ids.requester,
      name: null,
    });
    assert.equal(down.body.meta.namesAvailable, false);

    assert.equal((await get("no-such-ticket")).status, 404);
    assert.equal((await get(ticketId, buyerToken)).status, 403);
    assert.equal(
      (await request(app).get(`/executive/tickets/${ticketId}`)).status,
      401,
    );
  } finally {
    if (!closed) await new Promise((resolve) => auth.close(() => resolve()));
    if (previousAuth === undefined) delete process.env.AUTH_SERVICE_URL;
    else process.env.AUTH_SERVICE_URL = previousAuth;
    if (ticketId) {
      await prisma.supportTicket.deleteMany({ where: { id: ticketId } });
    }
    await prisma.$disconnect();
  }
});
