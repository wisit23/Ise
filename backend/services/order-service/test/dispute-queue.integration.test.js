const { test } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";
const prisma = require("../src/models/prismaClient");
const app = require("../src/app");
const { signAccessToken } = require("@reloop/shared");
app.locals.validateAccessSession = async () => {};

test("access-aware dispute queue paginates more than 50 cases with terminal SLA last", async (t) => {
  if (
    !process.env.DATABASE_URL_ORDER ||
    !new URL(process.env.DATABASE_URL_ORDER).pathname.startsWith("/reloop_ui_")
  ) {
    if (process.env.REQUIRE_INTEGRATION === "1")
      throw new Error("This test requires a dedicated reloop_ui_* database");
    t.skip("Set DATABASE_URL_ORDER to a dedicated reloop_ui_* test database");
    return;
  }
  const tag = `ui-queue-${Date.now()}`;
  const ids = Array.from({ length: 57 }, (_, index) => `${tag}-${index}`);
  const orders = ids.map((id, index) => ({
    id,
    buyerId: `${tag}-buyer`,
    sellerId: `${tag}-seller`,
    productId: `${tag}-product`,
    productTitle: "Queue test",
    price: 100,
    status: "disputed",
    createdAt: new Date(2026, 0, 1, 0, index),
  }));
  const cases = ids.map((id, index) => ({
    id: `d-${id}`,
    orderId: id,
    openedBy: `${tag}-buyer`,
    reason: tag,
    status: index < 50 ? "OPEN" : "DECIDED",
    slaExpiresAt: new Date(2026, 0, 1, 0, index),
    assignedTo: index === 56 ? "other" : null,
    assignedRole: index === 55 ? "ADMIN" : null,
    priorityScore: 10,
  }));
  t.after(async () => {
    await prisma.disputeCase.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.order.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });
  await prisma.order.createMany({ data: orders });
  await prisma.disputeCase.createMany({ data: cases });
  const token = signAccessToken({ sub: `${tag}-cs`, role: "CUSTOMER_SERVICE" });
  const get = (params) =>
    request(app)
      .get("/disputes/queue")
      .query({ q: tag, scope: "all", limit: 20, sort: "sla", ...params })
      .set("Authorization", `Bearer ${token}`);
  const pages = await Promise.all([
    get({ page: 1 }),
    get({ page: 2 }),
    get({ page: 3 }),
  ]);
  pages.forEach((page) => {
    assert.equal(page.status, 200);
    assert.equal(page.body.total, 55);
    assert.equal(page.body.totalPages, 3);
  });
  const items = pages.flatMap((page) => page.body.items);
  assert.equal(new Set(items.map((item) => item.id)).size, 55);
  assert.ok(items.slice(0, 50).every((item) => item.status === "OPEN"));
  assert.ok(items.slice(50).every((item) => item.sla.state === "complete"));
  assert.equal((await get({ assignedRole: "ADMIN" })).body.total, 0);
  assert.equal((await get({ scope: "invalid" })).status, 400);
  assert.equal((await get({ scope: "unassigned" })).body.total, 50);
  assert.equal(
    (await get({ scope: "unassigned", status: "DECIDED" })).body.total,
    5,
  );
});
