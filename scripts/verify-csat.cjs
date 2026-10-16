// Local acceptance check. Adds clearly labelled QA fixtures; never resets existing data.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const env = require("dotenv").parse(
  fs.readFileSync(path.join(__dirname, "../.env")),
);
const base = `http://127.0.0.1:${env.GATEWAY_PORT || 8080}`;
function localDatabase(value) {
  const url = new URL(value);
  if (
    !["localhost", "127.0.0.1", "postgres"].includes(url.hostname) ||
    !url.pathname.startsWith("/reloop_")
  )
    throw new Error(
      "CSAT verification is only allowed on local RE-LOOP databases",
    );
  url.hostname = "127.0.0.1";
  url.port = env.POSTGRES_PORT || "5432";
  return url.toString();
}
const {
  PrismaClient,
} = require("../backend/services/order-service/src/generated/prisma-client");
const order =
  require("../backend/services/order-service/src/models/erClient").wrapClient(
    new PrismaClient({
      datasources: { db: { url: localDatabase(env.DATABASE_URL_ORDER) } },
    }),
  );
const accounts = {};
async function request(
  route,
  role,
  body,
  method = body ? "POST" : "GET",
  expected = 200,
) {
  const res = await fetch(base + route, {
    method,
    headers: {
      ...(role
        ? { Authorization: `Bearer ${accounts[role].accessToken}` }
        : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json();
  assert.equal(
    res.status,
    expected,
    `${method} ${route}: ${JSON.stringify(data)}`,
  );
  return data;
}
async function main() {
  for (const [role, email] of Object.entries({
    buyer: "buyer.demo@example.com",
    seller: "shop.denim@example.com",
    cs: "cs.nan@example.com",
    other: "shop.sneaker@example.com",
  }))
    accounts[role] = await request("/api/auth/login", null, {
      email,
      password: "password123",
    });
  if (process.argv.includes("--read-only")) {
    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(
          __dirname,
          "../docs/featureplan/customer-service/ui-verification/csat-qa-manifest.json",
        ),
        "utf8",
      ),
    );
    for (const ticket of manifest.tickets) {
      const result = await request(
        `/api/support/tickets/${ticket.id}/csat`,
        ticket.role,
      );
      assert.ok(result.response || result.eligible);
    }
    for (const dispute of manifest.disputes) {
      for (const role of ["buyer", "seller"]) {
        const result = await request(
          `/api/orders/disputes/${dispute.id}/csat`,
          role,
        );
        assert.ok(result.response || result.eligible);
      }
    }
    for (const route of ["/api/support/tickets", "/api/orders/disputes"]) {
      const { csat } = await request(route + "/agent-dashboard?days=14", "cs");
      assert.equal(
        csat.total,
        csat.distribution.reduce((sum, row) => sum + row.count, 0),
      );
      assert.equal(
        csat.percent,
        csat.total ? Math.round((csat.satisfied / csat.total) * 100) : null,
      );
      console.log(
        `PASS ${route}: ${csat.satisfied}/${csat.total} satisfied (${csat.percent}%)`,
      );
    }
    console.log(
      "PASS saved ticket/dispute ratings remain readable after service recreation",
    );
    return;
  }
  const stamp = randomUUID();
  const manifest = {
    createdAt: new Date().toISOString(),
    tickets: [],
    disputes: [],
    checks: [],
  };
  const check = (text) => {
    manifest.checks.push(text);
    console.log(`PASS ${text}`);
  };
  const category = (await request("/api/support/tickets/categories", "buyer"))
    .items[0].value;
  const dashboard = async () => {
    const sources = await Promise.all(
      ["/api/support/tickets", "/api/orders/disputes"].map((route) =>
        request(route + "/agent-dashboard?days=14", "cs"),
      ),
    );
    return sources.map((source) => source.csat);
  };
  const before = await dashboard();
  for (const role of ["buyer", "seller"]) {
    const ticket = await request(
      "/api/support/tickets",
      role,
      { subject: `[CSAT QA] ${role} ${stamp}`, category },
      "POST",
      201,
    );
    const route = `/api/support/tickets/${ticket.id}`;
    await request(route + "/csat", null, undefined, "GET", 401);
    await request(route + "/csat", "other", undefined, "GET", 403);
    await request(route + "/csat", role, { rating: 5 }, "POST", 409);
    await request(route + "/assign", "cs", {});
    await request(route + "/status", "cs", { status: "IN_PROGRESS" }, "PATCH");
    await request(route + "/status", "cs", { status: "RESOLVED" }, "PATCH");
    await request(route + "/csat", role, { rating: "5" }, "POST", 400);
    const rating = role === "buyer" ? 5 : 3;
    await Promise.all(
      [1, 2].map(() =>
        request(route + "/csat", role, {
          rating,
          comment: "[CSAT QA] บริการของเจ้าหน้าที่",
        }),
      ),
    );
    await request(route + "/csat", role, { rating: 1 }, "POST", 409);
    assert.equal(
      (await request(route + "/csat", role)).response.rating,
      rating,
    );
    await request(route + "/status", "cs", { status: "CLOSED" }, "PATCH");
    assert.equal((await request(route + "/csat", role)).eligible, false);
    manifest.tickets.push({
      role,
      id: ticket.id,
      url: `http://localhost:3000/support/tickets/${ticket.id}`,
    });
  }
  check(
    "Buyer and seller tickets: eligibility, identity, validation, concurrent retry, persistence after closure",
  );

  // Controlled fixtures model an Admin verdict after CS handoff without triggering payments or inventory.
  for (const preview of [false, true]) {
    const orderId = `csat-qa-order-${randomUUID()}`;
    const now = new Date();
    const fixture = await order.order.create({
      data: {
        id: orderId,
        buyerId: accounts.buyer.user.id,
        sellerId: accounts.seller.user.id,
        productId: `csat-qa-product-${stamp}`,
        productTitle: "[CSAT QA] ทดสอบแบบประเมิน",
        orderType: "BUY_NOW",
        originalAmount: 100,
        ordersAmount: 100,
        status: "completed",
      },
    });
    const dispute = await order.disputeCase.create({
      data: {
        orderId: fixture.id,
        createdBy: accounts.buyer.user.id,
        reason: "[CSAT QA] ตรวจแบบประเมิน buyer และ seller",
        disputeType: "ITEM_NOT_AS_DESCRIBED",
        status: "OPEN",
        assignedTo: accounts.cs.user.id,
        assignedRole: "CUSTOMER_SERVICE",
      },
    });
    const route = `/api/orders/disputes/${dispute.id}/csat`;
    await request(route, "buyer", { rating: 5 }, "POST", 409);
    await order.disputeCaseLog.create({
      data: {
        disputeCaseId: dispute.id,
        actorId: accounts.cs.user.id,
        action: "CLAIM",
        toAssignedTo: accounts.cs.user.id,
        toAssignedRole: "CUSTOMER_SERVICE",
        detail: "[CSAT QA] CS claim",
        createdAt: now,
      },
    });
    await order.disputeCase.update({
      where: { id: dispute.id },
      data: {
        status: "DECIDED",
        decision: "REJECT",
        decisionReason: "[CSAT QA] ผลพิจารณาสำหรับทดสอบ UI",
        decidedAt: new Date(),
        assignedRole: "ADMIN",
        assignedTo: "40000000-0000-0000-0000-000000000002",
      },
    });
    await request(route, "other", undefined, "GET", 403);
    await request(route, "cs", { rating: 5 }, "POST", 403);
    if (!preview) {
      await Promise.all(
        ["buyer", "seller"].map((role) =>
          request(route, role, {
            rating: role === "buyer" ? 4 : 2,
            comment: `[CSAT QA] ${role} feedback`,
          }),
        ),
      );
      assert.equal((await request(route, "buyer")).response.rating, 4);
      assert.equal((await request(route, "seller")).response.rating, 2);
      await request(route, "buyer", { rating: 1 }, "POST", 409);
    }
    manifest.disputes.push({
      id: dispute.id,
      preview,
      orderId,
      url: `http://localhost:3000/support/cases/${orderId}`,
    });
  }
  check(
    "Disputes: independent buyer/seller responses, ownership, closed-state check, private feedback",
  );
  const after = await dashboard();
  for (let i = 0; i < 2; i++) {
    assert.equal(after[i].total - before[i].total, 2);
    assert.equal(after[i].satisfied - before[i].satisfied, 1);
  }
  check(
    "Both dashboards count each response once and credit CS history after Admin handoff",
  );
  // Retain an unrated ticket for hands-on UI verification.
  for (const role of ["buyer", "seller"]) {
    const ticket = await request(
      "/api/support/tickets",
      role,
      { subject: `[CSAT QA] ทดลองให้คะแนน ${role}`, category },
      "POST",
      201,
    );
    const route = `/api/support/tickets/${ticket.id}`;
    await request(route + "/assign", "cs", {});
    await request(route + "/status", "cs", { status: "IN_PROGRESS" }, "PATCH");
    await request(route + "/status", "cs", { status: "RESOLVED" }, "PATCH");
    manifest.tickets.push({
      role,
      id: ticket.id,
      preview: true,
      url: `http://localhost:3000/support/tickets/${ticket.id}`,
    });
  }
  const destination = path.join(
    __dirname,
    "../docs/featureplan/customer-service/ui-verification/csat-qa-manifest.json",
  );
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, JSON.stringify(manifest, null, 2));
  console.log(
    "Saved QA fixture links: docs/featureplan/customer-service/ui-verification/csat-qa-manifest.json",
  );
}
main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => order.$disconnect());
