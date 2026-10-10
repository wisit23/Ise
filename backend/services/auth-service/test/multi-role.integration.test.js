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

test("customer multi-role is allowed while staff/customer mixing is rejected", async (t) => {
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
      lastName: "Customer",
    });
    assert.equal(registerRes.status, 201);

    // No explicit UserRole rows exist yet — legacy `role` column must still
    // resolve to the correct functional permission set (Step 4: migrated Buyer/Seller).
    const initialClaims = verifyAccessToken(registerRes.body.accessToken);
    assert.deepEqual(initialClaims.roles, ["BUYER"]);
    assert.equal(hasPermission(initialClaims.roles, "order:purchase"), true);
    assert.equal(hasPermission(initialClaims.roles, "admin:user:ban"), false);

    const userId = registerRes.body.user.id;

    // A customer may be both buyer and seller.
    await authService.assignRole(userId, "SELLER");

    const loginRes = await request(app)
      .post("/login")
      .send({ email, password });
    const customerClaims = verifyAccessToken(loginRes.body.accessToken);
    assert.deepEqual([...customerClaims.roles].sort(), ["BUYER", "SELLER"]);
    assert.equal(hasPermission(customerClaims.roles, "order:purchase"), true);

    // A staff role may never be added to a customer account.
    await assert.rejects(
      () => authService.assignRole(userId, "CUSTOMER_SERVICE"),
      /cannot be combined with a staff role/,
    );

    // Removing SELLER leaves a valid BUYER account and is reflected immediately.
    await authService.removeRole(userId, "SELLER");
    const refreshRes = await request(app)
      .post("/refresh")
      .send({ refreshToken: loginRes.body.refreshToken });
    const afterRemovalClaims = verifyAccessToken(refreshRes.body.accessToken);
    assert.deepEqual(afterRemovalClaims.roles, ["BUYER"]);
    assert.equal(
      hasPermission(afterRemovalClaims.roles, "product:write"),
      false,
    );

    // A user must always keep at least one role.
    await assert.rejects(
      () => authService.removeRole(userId, "BUYER"),
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
