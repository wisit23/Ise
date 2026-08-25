const { badRequest, conflict, notFound } = require("@reloop/shared");
const prisma = require("../../models/prismaClient");

const ALLOWED_DECISIONS = ["VERIFIED", "REJECTED"];

async function listQueue({ page, limit, status }) {
  const where = { status: status || "PENDING" };
  const [items, total] = await Promise.all([
    prisma.kycApplication.findMany({
      where,
      orderBy: { submittedAt: "asc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    }),
    prisma.kycApplication.count({ where }),
  ]);
  return { items, total };
}

/**
 * `version` is the optimistic-lock value the caller last saw. A mismatch means
 * someone else already decided (or resubmitted) this application since —
 * reject the write instead of silently overwriting their outcome.
 */
async function decideKyc({ applicationId, decision, reason, version, adminId }) {
  if (!ALLOWED_DECISIONS.includes(decision)) {
    throw badRequest("decision must be VERIFIED or REJECTED");
  }
  if (!reason) throw badRequest("reason is required");
  if (typeof version !== "number") throw badRequest("version is required");

  const application = await prisma.kycApplication.findUnique({
    where: { id: applicationId },
  });
  if (!application) throw notFound("KYC application not found");
  if (application.status !== "PENDING") {
    throw conflict("KYC application has already been decided");
  }
  if (application.version !== version) {
    throw conflict("KYC application was modified — reload and retry");
  }

  const updatedApplication = await prisma.kycApplication.update({
    where: { id: applicationId },
    data: {
      status: decision,
      reason,
      decidedAt: new Date(),
      decidedBy: adminId,
      version: { increment: 1 },
    },
  });

  const sellerProfile = await prisma.sellerProfile.update({
    where: { userId: application.userId },
    data: {
      kycStatus: decision,
      verifiedAt: decision === "VERIFIED" ? new Date() : null,
    },
  });

  return {
    application: updatedApplication,
    sellerStatus: {
      userId: sellerProfile.userId,
      kycStatus: sellerProfile.kycStatus,
      verifiedAt: sellerProfile.verifiedAt,
    },
  };
}

module.exports = { listQueue, decideKyc };
