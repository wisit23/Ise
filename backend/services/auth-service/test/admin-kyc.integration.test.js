// Integration test against a real, disposable Postgres database — same
// skip/REQUIRE_INTEGRATION=1 convention as the other *.integration.test.js files.
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";
if (process.env.DATABASE_URL_AUTH) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_AUTH;
}

const bcrypt = require("bcryptjs");
const prisma = require("../src/models/prismaClient");
const app = require("../src/app");
const { signAccessToken, permissionsForRoles } = require("@reloop/shared");

const TEST_EMAIL_PREFIX = "adm-002-integration-test+";

async function databaseIsReachable() {
  if (!process.env.DATABASE_URL) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

function tokenFor(userId, roles) {
  return signAccessToken({
    sub: userId,
    role: roles[0],
    roles,
    permissions: permissionsForRoles(roles),
  });
}

test("KYC decisions enforce permission, version and single-decision rules", async (t) => {
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
  let seller;
  let application;

  try {
    // Seed a Seller with a pending Synthetic KYC application directly —
    // submission is Seller/SEL-001's job, not Admin's (ADM-DEC-001 ownership).
    seller = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash("irrelevant-password", 10),
        firstName: "Test",
        lastName: "Seller",
        role: "SELLER",
        sellerProfile: { create: { shopName: "Test Shop" } },
      },
    });
    application = await prisma.kycApplication.create({
      data: { userId: seller.id, documentUrl: "https://example.test/doc.pdf" },
    });

    const adminToken = tokenFor("admin-1", ["ADMIN"]);
    const marketingToken = tokenFor("marketing-1", ["MARKETING"]);

    // Wrong role must be denied before touching application state.
    const deniedRes = await request(app)
      .post(`/admin/kyc/${application.id}/decision`)
      .set("Authorization", `Bearer ${marketingToken}`)
      .send({ decision: "VERIFIED", reason: "looks fine", version: application.version });
    assert.equal(deniedRes.status, 403);

    // Stale version must be rejected as a conflict, not silently applied.
    const staleRes = await request(app)
      .post(`/admin/kyc/${application.id}/decision`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ decision: "VERIFIED", reason: "looks fine", version: application.version + 1 });
    assert.equal(staleRes.status, 409);

    // Correct version approves and updates the Seller's status in the same call.
    const approveRes = await request(app)
      .post(`/admin/kyc/${application.id}/decision`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ decision: "VERIFIED", reason: "documents match", version: application.version });
    assert.equal(approveRes.status, 200);
    assert.equal(approveRes.body.application.status, "VERIFIED");
    assert.equal(approveRes.body.sellerStatus.kycStatus, "VERIFIED");
    assert.ok(approveRes.body.sellerStatus.verifiedAt);

    const persisted = await prisma.kycApplication.findUnique({
      where: { id: application.id },
    });
    assert.equal(persisted.status, "VERIFIED");
    assert.equal(persisted.decidedBy, "admin-1");

    // A second decision on the same (now-decided) application must conflict,
    // even with the version that was correct the first time.
    const doubleRes = await request(app)
      .post(`/admin/kyc/${application.id}/decision`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ decision: "REJECTED", reason: "changed my mind", version: application.version });
    assert.equal(doubleRes.status, 409);
  } finally {
    if (application) {
      await prisma.kycApplication.deleteMany({ where: { userId: seller.id } });
    }
    if (seller) {
      await prisma.sellerProfile.deleteMany({ where: { userId: seller.id } });
      await prisma.user.deleteMany({ where: { id: seller.id } });
    }
    await prisma.$disconnect();
  }
});
