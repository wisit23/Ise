const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";
process.env.INTERNAL_SERVICE_TOKEN ||= "test-internal-token";
if (process.env.DATABASE_URL_AUTH) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_AUTH;
}

const prisma = require("../src/models/prismaClient");
const app = require("../src/app");
const { signAccessToken, permissionsForRoles } = require("@reloop/shared");

const TEST_EMAIL_PREFIX = "buyer-audit-integration-test+";

async function databaseIsReachable() {
  if (!process.env.DATABASE_URL) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

function adminToken() {
  const roles = ["ADMIN"];
  return signAccessToken({
    sub: "buyer-audit-admin",
    role: "ADMIN",
    roles,
    permissions: permissionsForRoles(roles),
  });
}

test("buyer login history, activity ingestion and admin audit access", async (t) => {
  if (!(await databaseIsReachable())) {
    const message =
      "DATABASE_URL not set or database unreachable — use a disposable auth test database";
    if (process.env.REQUIRE_INTEGRATION === "1") {
      throw new Error(`REQUIRE_INTEGRATION=1 but ${message}`);
    }
    t.skip(message);
    return;
  }

  const email = `${TEST_EMAIL_PREFIX}${Date.now()}@example.test`;
  const password = "correct-horse-battery-staple";
  let buyerId;

  try {
    const registerRes = await request(app).post("/register").send({
      email,
      password,
      firstName: "Buyer",
      lastName: "Audit",
    });
    assert.equal(registerRes.status, 201);
    buyerId = registerRes.body.user.id;

    const loginRes = await request(app)
      .post("/login")
      .set("User-Agent", "buyer-audit-test-agent")
      .send({ email, password });
    assert.equal(loginRes.status, 200);

    const buyerToken = loginRes.body.accessToken;
    const ownActivityRes = await request(app)
      .post("/me/activity")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({
        // Must be ignored; the service binds self-reported events to the JWT.
        buyerId: "another-user",
        action: "PRODUCT_VIEWED",
        targetType: "product",
        targetId: "product-1",
        metadata: { placement: "catalog" },
        requestId: `web-${buyerId}`,
      });
    assert.equal(ownActivityRes.status, 201);
    assert.equal(ownActivityRes.body.buyerId, buyerId);

    const internalActivityRes = await request(app)
      .post("/internal/buyer-activity")
      .set("x-internal-token", process.env.INTERNAL_SERVICE_TOKEN)
      .send({
        buyerId,
        action: "ORDER_PLACED",
        source: "ORDER_SERVICE",
        targetType: "order",
        targetId: "order-1",
        requestId: `order-${buyerId}`,
      });
    assert.equal(internalActivityRes.status, 201);

    // Replaying the same event is idempotent.
    const replayRes = await request(app)
      .post("/internal/buyer-activity")
      .set("x-internal-token", process.env.INTERNAL_SERVICE_TOKEN)
      .send({
        buyerId,
        action: "ORDER_PLACED",
        source: "ORDER_SERVICE",
        targetType: "order",
        targetId: "order-1",
        requestId: `order-${buyerId}`,
      });
    assert.equal(replayRes.status, 200);
    assert.equal(replayRes.body.id, internalActivityRes.body.id);

    const ownListRes = await request(app)
      .get("/me/activity")
      .set("Authorization", `Bearer ${buyerToken}`);
    assert.equal(ownListRes.status, 200);
    assert.equal(ownListRes.body.total, 2);

    const adminListRes = await request(app)
      .get(`/admin/buyers/${buyerId}/activity?action=ORDER_PLACED`)
      .set("Authorization", `Bearer ${adminToken()}`);
    assert.equal(adminListRes.status, 200);
    assert.equal(adminListRes.body.total, 1);

    const logoutRes = await request(app)
      .post("/logout")
      .send({ refreshToken: loginRes.body.refreshToken });
    assert.equal(logoutRes.status, 204);

    const loginHistoryRes = await request(app)
      .get("/me/login-history")
      .set("Authorization", `Bearer ${buyerToken}`);
    assert.equal(loginHistoryRes.status, 200);
    assert.equal(loginHistoryRes.body.total, 1);
    assert.equal(
      loginHistoryRes.body.items[0].userAgent,
      "buyer-audit-test-agent",
    );
    assert.ok(loginHistoryRes.body.items[0].logoutAt);
  } finally {
    if (buyerId) {
      await prisma.buyerActivityLog.deleteMany({ where: { buyerId } });
      await prisma.refreshToken.deleteMany({ where: { userId: buyerId } });
      await prisma.loginLog.deleteMany({ where: { userId: buyerId } });
      await prisma.user.deleteMany({ where: { id: buyerId } });
    }
    await prisma.$disconnect();
  }
});
