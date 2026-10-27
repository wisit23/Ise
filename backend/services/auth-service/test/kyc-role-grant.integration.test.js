const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const prisma = require("../src/models/prismaClient");
const { submitKyc } = require("../src/features/kyc/kycService");
const { decideKyc } = require("../src/features/adminKyc/adminKycService");
const { assignRole } = require("../src/services/authService");

test("seller access follows approval, with atomic rollback and repair of unapproved legacy accounts", async (t) => {
  if (!process.env.DATABASE_URL) {
    if (process.env.REQUIRE_INTEGRATION === "1")
      throw new Error("DATABASE_URL required");
    t.skip("requires an isolated Auth PostgreSQL database");
    return;
  }
  const ids = [];
  const stamp = `${Date.now()}-${process.pid}`;
  const user = async (key, role = "BUYER") => {
    const row = await prisma.user.create({
      data: {
        email: `kyc-role-${key}-${stamp}@test.local`,
        passwordHash: "fixture",
        firstName: key,
        lastName: "Test",
        role,
      },
    });
    ids.push(row.id);
    return row;
  };
  const apply = (userId) =>
    submitKyc({
      userId,
      shopName: "Test shop",
      idCardNumber: "1234567890123",
      address: "Test address",
      verifyMethod: "thai_id",
    });
  const sellerRoles = (userId) =>
    prisma.userRole.count({ where: { userId, role: "SELLER" } });
  try {
    const admin = await user("admin", "ADMIN");
    const buyer = await user("applicant");
    const pending = await apply(buyer.id);
    assert.equal(
      (await prisma.user.findUnique({ where: { id: buyer.id } })).role,
      "BUYER",
    );
    assert.equal(await sellerRoles(buyer.id), 0);
    const application = await prisma.kycApplication.findUnique({
      where: { id: pending.applicationId },
    });
    const decide = (id, value, version = application.version) =>
      decideKyc({
        applicationId: id,
        adminId: admin.id,
        decision: value,
        reason: "Test decision",
        version,
      });
    await decide(pending.applicationId, "REJECTED");
    assert.equal(await sellerRoles(buyer.id), 0);
    assert.equal(
      (await prisma.user.findUnique({ where: { id: buyer.id } })).role,
      "BUYER",
    );
    const resubmitted = await apply(buyer.id);
    await decide(resubmitted.applicationId, "VERIFIED");
    assert.equal(
      (await prisma.user.findUnique({ where: { id: buyer.id } })).role,
      "SELLER",
    );
    assert.equal(await sellerRoles(buyer.id), 1);
    assert.equal(
      (await prisma.sellerProfile.findUnique({ where: { userId: buyer.id } }))
        .kycStatus,
      "VERIFIED",
    );
    await assert.rejects(
      decide(resubmitted.applicationId, "VERIFIED"),
      (err) => err.status === 409,
    );

    const broken = await user("rollback");
    const brokenApplication = await apply(broken.id);
    await prisma.sellerProfile.delete({ where: { userId: broken.id } });
    await assert.rejects(decide(brokenApplication.applicationId, "VERIFIED"));
    assert.equal(
      (await prisma.user.findUnique({ where: { id: broken.id } })).role,
      "BUYER",
    );
    assert.equal(await sellerRoles(broken.id), 0);
    assert.equal(
      (
        await prisma.kycApplication.findUnique({
          where: { id: brokenApplication.applicationId },
        })
      ).status,
      "PENDING",
    );

    const legacy = await user("legacy", "SELLER");
    await assignRole(legacy.id, "SELLER");
    await prisma.sellerProfile.create({
      data: { userId: legacy.id, shopName: "Legacy", kycStatus: "PENDING" },
    });
    // A seller renewing verification must keep the role they earned before.
    await prisma.sellerProfile.update({
      where: { userId: buyer.id },
      data: { kycStatus: "PENDING", verifiedAt: null },
    });
    const sql = fs.readFileSync(
      path.join(
        __dirname,
        "../prisma/migrations/20261028100000_grant_seller_after_kyc_approval/migration.sql",
      ),
      "utf8",
    );
    await prisma.$executeRawUnsafe(sql);
    assert.equal(
      (await prisma.user.findUnique({ where: { id: legacy.id } })).role,
      "BUYER",
    );
    assert.equal(await sellerRoles(legacy.id), 0);
    assert.equal(
      await prisma.userRole.count({
        where: { userId: legacy.id, role: "BUYER" },
      }),
      1,
    );
    assert.equal(
      (await prisma.user.findUnique({ where: { id: buyer.id } })).role,
      "SELLER",
    );
    assert.equal(await sellerRoles(buyer.id), 1);
    await prisma.$executeRawUnsafe(sql);
    assert.equal(
      await prisma.userRole.count({
        where: { userId: legacy.id, role: "BUYER" },
      }),
      1,
    );
  } finally {
    await prisma.adminAudit.deleteMany({ where: { actorId: { in: ids } } });
    await prisma.kycApplication.deleteMany({ where: { userId: { in: ids } } });
    await prisma.sellerProfile.deleteMany({ where: { userId: { in: ids } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  }
});
