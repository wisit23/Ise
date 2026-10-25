const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { clientFor, urlFor } = require("./reference-codes.cjs");
const {
  REFERENCE_MODELS,
  normalizeReferenceCode,
} = require("../backend/shared/src/referenceCodes");

async function main() {
  const base = new URL(
    process.env.REFERENCE_API_URL ||
      `http://127.0.0.1:${process.env.GATEWAY_PORT || 8080}`,
  );
  assert.ok(
    ["localhost", "127.0.0.1"].includes(base.hostname),
    "Local API only",
  );
  const clients = Object.fromEntries(
    Object.keys(REFERENCE_MODELS).map((service) => [
      service,
      clientFor(service),
    ]),
  );
  const sessions = new Map();
  const checks = [];
  async function request(route, session, options = {}) {
    const response = await fetch(new URL(route, base), {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(session ? { Authorization: `Bearer ${session.accessToken}` } : {}),
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  }
  try {
    let records = 0;
    for (const [service, models] of Object.entries(REFERENCE_MODELS)) {
      for (const [model, prefix] of Object.entries(models)) {
        const delegate =
          clients[service][model[0].toLowerCase() + model.slice(1)];
        const missingWhere =
          service === "chat"
            ? {
                OR: [
                  { referenceCode: null },
                  { referenceCode: { isSet: false } },
                ],
              }
            : { referenceCode: null };
        assert.equal(
          await delegate.count({ where: missingWhere }),
          0,
          `${service}.${model}: incomplete backfill`,
        );
        records += await delegate.count();
        const rows = await delegate.findMany({
          select: { id: true, referenceCode: true },
          take: 200,
        });
        for (const row of rows)
          assert.equal(
            normalizeReferenceCode(row.referenceCode, prefix),
            row.referenceCode,
          );
      }
    }
    checks.push(
      "25 entity types have no missing codes; sampled codes match their registered prefix",
    );
    const product = await clients.product.product.findFirst({
      where: { status: "available", moderatedAt: null },
    });
    assert.ok(product, "A public demo product is required");
    const legacy = await request(`/api/products/${product.id}`);
    const alias = await request(
      `/api/products/${product.referenceCode.toLowerCase().replaceAll("-", "")}`,
    );
    assert.equal(legacy.status, 200);
    assert.equal(alias.status, 200);
    assert.equal(alias.body.id, product.id);
    assert.equal(alias.body.referenceCode, product.referenceCode);
    const search = await request(
      `/api/products/search?q=${encodeURIComponent(product.referenceCode.toLowerCase().replaceAll("-", ""))}`,
    );
    assert.equal(search.status, 200);
    assert.ok(search.body.items.some((item) => item.id === product.id));
    checks.push(
      "public product ID, compact reference alias and catalog search identify the same product",
    );

    // Only known local demo credentials are used. No account or email is created.
    assert.ok(
      new URL(urlFor("auth")).pathname.startsWith("/reloop_demo_"),
      "Login checks require a local demo dataset",
    );
    const users = await clients.auth.user.findMany({
      where: { status: "ACTIVE", emailVerifiedAt: { not: null } },
    });
    const eligible = [];
    for (const user of users)
      if (await bcrypt.compare("password123", user.passwordHash))
        eligible.push(user);
    assert.ok(
      eligible.length >= 2,
      "At least two known demo accounts are required",
    );
    async function login(userId) {
      if (sessions.has(userId)) return sessions.get(userId);
      const user = eligible.find((item) => item.id === userId);
      assert.ok(user, "Known local demo account required");
      const response = await request("/api/auth/login", null, {
        method: "POST",
        body: { email: user.email, password: "password123" },
      });
      assert.equal(response.status, 200);
      assert.equal(response.body.user.id, user.id);
      assert.equal(response.body.user.referenceCode, user.referenceCode);
      sessions.set(userId, response.body);
      return response.body;
    }
    const ids = eligible.map((user) => user.id);
    const order = await clients.order.order.findFirst({
      where: { buyerId: { in: ids } },
    });
    assert.ok(order, "Known demo buyer order required");
    const owner = await login(order.buyerId);
    const outsiderUser = eligible.find(
      (user) => user.id !== order.buyerId && user.id !== order.sellerId,
    );
    const outsider = await login(outsiderUser.id);
    const own = await request(`/api/orders/${order.referenceCode}`, owner);
    assert.equal(own.status, 200);
    assert.equal(own.body.id, order.id);
    assert.equal(own.body.referenceCode, order.referenceCode);
    assert.ok(
      [403, 404].includes(
        (await request(`/api/orders/${order.referenceCode}`, outsider)).status,
      ),
    );
    assert.equal(
      (await request(`/api/orders/${order.referenceCode}`)).status,
      401,
    );
    checks.push(
      "order reference preserves ownership checks and denies outsider/anonymous access",
    );

    const ticket = await clients.support.supportTicket.findFirst({
      where: { requesterId: { in: ids } },
    });
    assert.ok(ticket, "Known demo support ticket required");
    const ticketResponse = await request(
      `/api/support/tickets/${ticket.referenceCode}`,
      await login(ticket.requesterId),
    );
    assert.equal(ticketResponse.status, 200);
    assert.equal(ticketResponse.body.id, ticket.id);
    checks.push(
      "ticket reference resolves the original ticket for its requester",
    );

    const conversation = await clients.chat.conversation.findFirst({
      where: { participants: { some: { userId: { in: ids }, leftAt: null } } },
    });
    assert.ok(conversation, "Known demo conversation required");
    const participant = conversation.participants.find(
      (item) => ids.includes(item.userId) && !item.leftAt,
    );
    const room = await request(
      `/api/chat/conversations/${conversation.referenceCode}`,
      await login(participant.userId),
    );
    assert.equal(room.status, 200);
    assert.equal(room.body.id, conversation.id);
    assert.equal(room.body.referenceCode, conversation.referenceCode);
    const nonparticipant = eligible.find(
      (user) =>
        !conversation.participants.some(
          (item) => item.userId === user.id && !item.leftAt,
        ),
    );
    assert.ok(
      [403, 404].includes(
        (
          await request(
            `/api/chat/conversations/${conversation.referenceCode}`,
            await login(nonparticipant.id),
          )
        ).status,
      ),
    );
    checks.push(
      "chat reference preserves ObjectId identity and participant-only access",
    );
    const buyer = users.find((user) => user.id === order.buyerId);
    assert.equal(own.body.buyerReferenceCode, buyer.referenceCode);
    assert.equal(ticketResponse.body.requesterReferenceCode, users.find((user) => user.id === ticket.requesterId).referenceCode);
    checks.push("buyer order and requester ticket receive the persisted related-user references across service boundaries");
    const seller = eligible.find((user) => user.role === "SELLER");
    assert.ok(seller, "Known demo seller required");
    const selling = await request("/api/orders/selling?limit=5", await login(seller.id));
    assert.equal(selling.status, 200);
    const sellerOrders = Array.isArray(selling.body) ? selling.body : selling.body.items;
    assert.ok(sellerOrders.every((row) => row.referenceCode?.startsWith("ORD-")));
    checks.push("SELLER: own orders load with the persisted ORD references");

    const roleRoutes = {
      ADMIN: "/api/auth/admin/reports?scope=all&limit=5",
      CUSTOMER_SERVICE: "/api/support/tickets/queue?scope=unassigned&limit=5",
      TRUST_AND_SAFETY: "/api/orders/disputes/queue?scope=unassigned&limit=5",
      MARKETING: "/api/products/marketing/audit-logs?limit=5",
      EXECUTIVE: "/api/auth/executive/reports?limit=5",
    };
    for (const [role, route] of Object.entries(roleRoutes)) {
      const user = eligible.find((item) => item.role === role);
      assert.ok(user, `Known demo ${role} account required`);
      const result = await request(route, await login(user.id));
      assert.equal(result.status, 200, `${role}: ${JSON.stringify(result.body).slice(0, 150)}`);
      checks.push(`${role}: authorized workspace data loads with reference enrichment`);
    }
    const admin = eligible.find((user) => user.role === "ADMIN");
    const reviewReports = await clients.auth.report.findMany({ where: { reason: { contains: "[รายงานรีวิว" } } });
    let reviewReport;
    for (const candidate of reviewReports) {
      const reviewId = candidate.reason.match(/\[รายงานรีวิว\s*#?([^\]]+)\]/)?.[1]?.trim();
      if (reviewId && await clients.product.review.findUnique({ where: { id: reviewId }, select: { id: true } })) { reviewReport = candidate; break; }
    }
    assert.ok(reviewReport, "Known demo review report required");
    const reportResponse = await request(`/api/auth/admin/reports/${reviewReport.referenceCode}`, await login(admin.id));
    assert.equal(reportResponse.status, 200);
    assert.equal(reportResponse.body.reporterReferenceCode, reportResponse.body.reporter.referenceCode);
    assert.ok(reportResponse.body.reporter.referenceCode?.startsWith("USR-"));
    assert.ok(reportResponse.body.target.referenceCode?.startsWith("USR-"));
    assert.ok(reportResponse.body.reviewDetail?.review?.referenceCode?.startsWith("REV-"));
    const audit = await request(`/api/auth/admin/audit?actorId=${admin.referenceCode.toLowerCase().replaceAll("-", "")}&limit=5`, await login(admin.id));
    assert.equal(audit.status, 200);
    assert.ok(audit.body.items.every((row) => row.actorId === admin.id));
    const preview = await request("/api/auth/admin/bulk", await login(admin.id), { method: "POST", body: { action: "WARN_USER", ids: [outsiderUser.referenceCode.toLowerCase().replaceAll("-", "")], reason: "ตรวจรูปแบบรหัสอ้างอิง (preview เท่านั้น)", dryRun: true } });
    assert.equal(preview.status, 200);
    assert.equal(preview.body.results[0].id, outsiderUser.id);
    assert.equal(preview.body.results[0].referenceCode, outsiderUser.referenceCode);
    assert.equal(preview.body.dryRun, true);
    checks.push("review report resolves reporter, target and review codes; copied staff code filters audit records without changing internal IDs");
    console.log(
      JSON.stringify(
        {
          records,
          checks,
          browserSample: {
            productId: product.id,
            referenceCode: product.referenceCode,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    for (const session of sessions.values())
      await request("/api/auth/logout", session, {
        method: "POST",
        body: { refreshToken: session.refreshToken },
      }).catch(() => {});
    await Promise.all(Object.values(clients).map((db) => db.$disconnect()));
  }
}
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
