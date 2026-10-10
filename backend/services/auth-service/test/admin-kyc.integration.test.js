// Integration test against a real, disposable Postgres database — same
// skip/REQUIRE_INTEGRATION=1 convention as the other *.integration.test.js files.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const request = require("supertest");

process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";
if (process.env.DATABASE_URL_AUTH) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_AUTH;
}

const bcrypt = require("bcryptjs");
const prisma = require("../src/models/prismaClient");
const app = require("../src/app");
const { absolutePath } = require("../src/features/kyc/kycStorage");
// This feature suite uses signed identity fixtures; live session enforcement
// is covered separately by account-suspension.integration.test.js.
app.locals.validateAccessSession = async () => {};
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
  const adminId = `adm-002-admin+${Date.now()}`;
  let admin;
  let seller;
  let application;
  let concurrentApplication;
  const documentKey = `adm-002-${Date.now()}.png`;

  try {
    admin = await prisma.user.create({
      data: {
        id: adminId,
        email: `${TEST_EMAIL_PREFIX}admin+${Date.now()}@example.test`,
        passwordHash: await bcrypt.hash("irrelevant-password", 10),
        firstName: "Admin",
        lastName: "Reviewer",
        role: "ADMIN",
      },
    });
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
    await fs.promises.writeFile(absolutePath(documentKey), "kyc-test-image");
    application = await prisma.kycApplication.create({
      data: {
        userId: seller.id,
        storageKey: documentKey,
        fileType: "image/png",
      },
    });

    const adminToken = tokenFor(adminId, ["ADMIN"]);
    const marketingToken = tokenFor("marketing-1", ["MARKETING"]);

    const pendingQueueRes = await request(app)
      .get("/admin/kyc?page=1&limit=100")
      .set("Authorization", `Bearer ${adminToken}`);
    assert.equal(pendingQueueRes.status, 200);
    assert.ok(
      pendingQueueRes.body.items.some((item) => item.id === application.id),
    );

    const allQueueRes = await request(app)
      .get("/admin/kyc?page=1&limit=100&status=ALL")
      .set("Authorization", `Bearer ${adminToken}`);
    assert.equal(allQueueRes.status, 200);
    assert.ok(
      allQueueRes.body.items.some((item) => item.id === application.id),
    );

    const documentRes = await request(app)
      .get(`/kyc/${application.id}/document`)
      .set("Authorization", `Bearer ${adminToken}`);
    assert.equal(documentRes.status, 200);
    assert.equal(documentRes.headers["content-type"], "image/png");
    assert.equal(
      await prisma.adminAudit.count({
        where: {
          actorId: adminId,
          targetId: application.id,
          action: "KYC_DOCUMENT_VIEWED",
        },
      }),
      1,
    );

    // Wrong role must be denied before touching application state.
    const deniedRes = await request(app)
      .post(`/admin/kyc/${application.id}/decision`)
      .set("Authorization", `Bearer ${marketingToken}`)
      .send({
        decision: "VERIFIED",
        reason: "looks fine",
        version: application.version,
      });
    assert.equal(deniedRes.status, 403);

    // Stale version must be rejected as a conflict, not silently applied.
    const staleRes = await request(app)
      .post(`/admin/kyc/${application.id}/decision`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        decision: "VERIFIED",
        reason: "looks fine",
        version: application.version + 1,
      });
    assert.equal(staleRes.status, 409);

    // Correct version approves and updates the Seller's status in the same call.
    const approveRes = await request(app)
      .post(`/admin/kyc/${application.id}/decision`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        decision: "VERIFIED",
        reason: "documents match",
        version: application.version,
      });
    assert.equal(approveRes.status, 200);
    assert.equal(approveRes.body.application.status, "VERIFIED");
    assert.equal(approveRes.body.sellerStatus.kycStatus, "VERIFIED");
    assert.ok(approveRes.body.sellerStatus.verifiedAt);

    const persisted = await prisma.kycApplication.findUnique({
      where: { id: application.id },
    });
    assert.equal(persisted.status, "VERIFIED");
    assert.equal(persisted.decidedBy, adminId);

    // A second decision on the same (now-decided) application must conflict,
    // even with the version that was correct the first time.
    const doubleRes = await request(app)
      .post(`/admin/kyc/${application.id}/decision`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        decision: "REJECTED",
        reason: "changed my mind",
        version: application.version,
      });
    assert.equal(doubleRes.status, 409);

    concurrentApplication = await prisma.kycApplication.create({
      data: {
        userId: seller.id,
        storageKey: "kyc/concurrent-test-doc.pdf",
        fileType: "application/pdf",
      },
    });
    const concurrentResponses = await Promise.all([
      request(app)
        .post(`/admin/kyc/${concurrentApplication.id}/decision`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          decision: "VERIFIED",
          reason: "concurrent approval",
          version: concurrentApplication.version,
        }),
      request(app)
        .post(`/admin/kyc/${concurrentApplication.id}/decision`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          decision: "REJECTED",
          reason: "concurrent rejection",
          version: concurrentApplication.version,
        }),
    ]);
    assert.deepEqual(
      concurrentResponses.map((res) => res.status).sort(),
      [200, 409],
    );
    const decisionAudits = await prisma.adminAudit.count({
      where: {
        targetId: concurrentApplication.id,
        action: { in: ["KYC_VERIFIED", "KYC_REJECTED"] },
      },
    });
    assert.equal(decisionAudits, 1);
  } finally {
    if (seller) {
      await prisma.adminAudit.deleteMany({
        where: {
          targetId: {
            in: [application?.id, concurrentApplication?.id].filter(Boolean),
          },
        },
      });
    }
    if (application) {
      await prisma.kycApplication.deleteMany({ where: { userId: seller.id } });
    }
    if (seller) {
      await prisma.sellerProfile.deleteMany({ where: { userId: seller.id } });
      await prisma.user.deleteMany({ where: { id: seller.id } });
    }
    if (admin) await prisma.user.deleteMany({ where: { id: admin.id } });
    await fs.promises.unlink(absolutePath(documentKey)).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
    await prisma.$disconnect();
  }
});
