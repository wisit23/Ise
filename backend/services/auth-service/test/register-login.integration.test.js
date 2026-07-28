// Integration test against a real, disposable Postgres database. Never runs
// against dev/prod data: it requires DATABASE_URL to point at a database
// created solely for this test run (see the CI workflow's postgres service
// container, or run one locally — instructions in docs/progress.md).
//
// If DATABASE_URL is not set or the database is unreachable, every test in
// this file skips cleanly instead of failing, so `npm test` still passes on
// a machine with no database configured.
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";

const prisma = require("../src/models/prismaClient");
const app = require("../src/app");

const TEST_EMAIL_PREFIX = "found-002-integration-test+";

async function databaseIsReachable() {
  if (!process.env.DATABASE_URL) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

test("register then login against a real database", async (t) => {
  if (!(await databaseIsReachable())) {
    t.skip(
      "DATABASE_URL not set or database unreachable — set it to a disposable test database " +
        "(after running `npx prisma db push` against it from backend/services/auth-service) to run this test",
    );
    return;
  }

  const email = `${TEST_EMAIL_PREFIX}${Date.now()}@example.test`;
  const password = "correct-horse-battery-staple";

  try {
    const registerRes = await request(app).post("/register").send({
      email,
      password,
      firstName: "Test",
      lastName: "User",
    });
    assert.equal(registerRes.status, 201);
    assert.equal(registerRes.body.user.email, email);
    assert.ok(registerRes.body.accessToken);
    assert.ok(registerRes.body.refreshToken);

    const loginRes = await request(app)
      .post("/login")
      .send({ email, password });
    assert.equal(loginRes.status, 200);
    assert.ok(loginRes.body.accessToken);

    const wrongPasswordRes = await request(app)
      .post("/login")
      .send({ email, password: "wrong-password" });
    assert.equal(wrongPasswordRes.status, 400);
  } finally {
    // Fixture isolation: remove only what this test created, even on a
    // long-lived local test database that isn't torn down after every run.
    await prisma.refreshToken.deleteMany({
      where: { user: { email: { startsWith: TEST_EMAIL_PREFIX } } },
    });
    await prisma.loginLog.deleteMany({
      where: { user: { email: { startsWith: TEST_EMAIL_PREFIX } } },
    });
    await prisma.user.deleteMany({
      where: { email: { startsWith: TEST_EMAIL_PREFIX } },
    });
    await prisma.$disconnect();
  }
});
