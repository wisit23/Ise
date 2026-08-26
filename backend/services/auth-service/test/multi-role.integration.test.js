// Integration test against a real, disposable Postgres database — same
// skip/REQUIRE_INTEGRATION=1 convention as register-login.integration.test.js.
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";
if (process.env.DATABASE_URL_AUTH) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_AUTH;
}

const prisma = require("../src/models/prismaClient");
const app = require("../src/app");
const authService = require("../src/services/authService");
const { verifyAccessToken, hasPermission } = require("@reloop/shared");

const TEST_EMAIL_PREFIX = "adm-001-integration-test+";

async function databaseIsReachable() {
  if (!process.env.DATABASE_URL) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

test("multi-role permissions are issued, migrated and stay fresh after removal", async (t) => {
  if (!(await databaseIsReachable())) {
    const message =
      "DATABASE_URL not set or database unreachable — set it to a disposable test database " +
      "(after running `npx prisma db push` against it from backend/services/auth-service) to run this test";
    if (process.env.REQUIRE_INTEGRATION === "1") {
      throw new Error(`REQUIRE_INTEGRATION=1 but ${message}`);
    }
    t.skip(message);
    return;
  }

  const email = `${TEST_EMAIL_PREFIX}${Date.now()}@example.test`;
  const password = "correct-horse-battery-staple";

  try {
    const registerRes = await request(app).post("/register").send({
      email,
      password,
      firstName: "Test",
      lastName: "Seller",
      role: "SELLER",
      shopName: "Test Shop",
    });
    assert.equal(registerRes.status, 201);

    // No explicit UserRole rows exist yet — legacy `role` column must still
    // resolve to the correct functional permission set (Step 4: migrated Buyer/Seller).
    const initialClaims = verifyAccessToken(registerRes.body.accessToken);
    assert.deepEqual(initialClaims.roles, ["SELLER"]);
    assert.equal(hasPermission(initialClaims.roles, "product:write"), true);
    assert.equal(hasPermission(initialClaims.roles, "admin:user:ban"), false);

    const userId = registerRes.body.user.id;

    // Promote to Customer Service in addition to Seller.
    await authService.assignRole(userId, "CUSTOMER_SERVICE");

    const loginRes = await request(app).post("/login").send({ email, password });
    const promotedClaims = verifyAccessToken(loginRes.body.accessToken);
    assert.ok(promotedClaims.roles.includes("SELLER"));
    assert.ok(promotedClaims.roles.includes("CUSTOMER_SERVICE"));
    assert.equal(hasPermission(promotedClaims.roles, "support:case:read"), true);
    assert.equal(hasPermission(promotedClaims.roles, "admin:user:ban"), false);

    // Removing SELLER must be reflected on the very next issued token (freshness).
    await authService.removeRole(userId, "SELLER");
    const refreshRes = await request(app)
      .post("/refresh")
      .send({ refreshToken: loginRes.body.refreshToken });
    const afterRemovalClaims = verifyAccessToken(refreshRes.body.accessToken);
    assert.deepEqual(afterRemovalClaims.roles, ["CUSTOMER_SERVICE"]);
    assert.equal(hasPermission(afterRemovalClaims.roles, "product:write"), false);

    // Staff denial: CUSTOMER_SERVICE alone must never grant Admin actions.
    assert.equal(hasPermission(afterRemovalClaims.roles, "admin:user:ban"), false);

    // A user must always keep at least one role.
    await assert.rejects(
      () => authService.removeRole(userId, "CUSTOMER_SERVICE"),
      /at least one role/,
    );
  } finally {
    await prisma.userRole.deleteMany({
      where: { user: { email: { startsWith: TEST_EMAIL_PREFIX } } },
    });
    await prisma.refreshToken.deleteMany({
      where: { user: { email: { startsWith: TEST_EMAIL_PREFIX } } },
    });
    await prisma.loginLog.deleteMany({
      where: { user: { email: { startsWith: TEST_EMAIL_PREFIX } } },
    });
    await prisma.sellerProfile.deleteMany({
      where: { user: { email: { startsWith: TEST_EMAIL_PREFIX } } },
    });
    await prisma.user.deleteMany({
      where: { email: { startsWith: TEST_EMAIL_PREFIX } },
    });
    await prisma.$disconnect();
  }
});