const { badRequest, conflict, notFound } = require("@reloop/shared");
const prisma = require("../../models/prismaClient");
const chatClient = require("../../services/chatClient");

const ALLOWED_DECISIONS = ["VERIFIED", "REJECTED"];

async function listQueue({ page, limit, status }) {
  const where = {};
  if (status === undefined || status === null) where.status = "PENDING";
  else if (status.trim() && status.trim() !== "ALL") {
    where.status = status.trim();
  }
  const [items, total] = await Promise.all([
    prisma.kycApplication.findMany({
      where,
      orderBy: { submittedAt: "asc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            sellerProfile: {
              select: {
                shopName: true,
                idCardNumber: true,
                address: true,
                bankAccount: true,
              },
            },
          },
        },
      },
    }),
    prisma.kycApplication.count({ where }),
  ]);
  return {
    items: items.map((item) => ({
      ...item,
      // The fixed schema has no per-application shop-profile snapshot. Be
      // explicit so historical rows are not mistaken for submitted values.
      profileSnapshotAvailable: false,
    })),
    total,
  };
}

/**
 * `version` is the optimistic-lock value the caller last saw. A mismatch means
 * someone else already decided (or resubmitted) this application since —
 * reject the write instead of silently overwriting their outcome.
 */
async function decideKyc({
  applicationId,
  decision,
  reason,
  version,
  adminId,
  requestId,
}) {
  if (!ALLOWED_DECISIONS.includes(decision)) {
    throw badRequest("decision must be VERIFIED or REJECTED");
  }
  const trimmedReason = reason?.trim();
  if (!trimmedReason) throw badRequest("reason is required");
  if (typeof version !== "number") throw badRequest("version is required");

  return prisma.$transaction(async (tx) => {
    const application = await tx.kycApplication.findUnique({
      where: { id: applicationId },
    });
    if (!application) throw notFound("KYC application not found");

    const claimed = await tx.kycApplication.updateMany({
      where: { id: applicationId, status: "PENDING", version },
      data: {
        status: decision,
        reason: trimmedReason,
        decidedAt: new Date(),
        decidedBy: adminId,
        version: { increment: 1 },
      },
    });
    if (claimed.count !== 1) {
      throw conflict("KYC application was already decided or modified");
    }

    const sellerProfile = await tx.sellerProfile.update({
      where: { userId: application.userId },
      data: {
        kycStatus: decision,
        verifiedAt: decision === "VERIFIED" ? new Date() : null,
      },
    });
    await tx.adminAudit.create({
      data: {
        actorId: adminId,
        action: `KYC_${decision}`,
        targetId: applicationId,
        reason: trimmedReason,
        requestId,
      },
    });
    const updatedApplication = await tx.kycApplication.findUnique({
      where: { id: applicationId },
    });

    return {
      application: updatedApplication,
      sellerStatus: {
        userId: sellerProfile.userId,
        kycStatus: sellerProfile.kycStatus,
        verifiedAt: sellerProfile.verifiedAt,
      },
    };
  });

  if (decision === "VERIFIED") {
    chatClient.sendSystemNotification({
      userId: outcome.application.userId,
      type: "SYSTEM",
      title: "การยืนยันตัวตน (KYC) ได้รับการอนุมัติ",
      message: `✅ การยืนยันตัวตนผู้ขายของคุณได้รับการอนุมัติเรียบร้อยแล้ว${trimmedReason ? ` (หมายเหตุ: ${trimmedReason})` : ""}`,
      link: "/seller/dashboard",
      entityId: `kyc:decision:${applicationId}`,
      metadata: { applicationId, decision, reason: trimmedReason },
    }).catch(() => {});
  } else if (decision === "REJECTED") {
    chatClient.sendSystemNotification({
      userId: outcome.application.userId,
      type: "SYSTEM",
      title: "การยืนยันตัวตน (KYC) ไม่ผ่านการอนุมัติ",
      message: `⚠️ การยืนยันตัวตนผู้ขายของคุณถูกปฏิเสธ เนื่องจาก: ${trimmedReason}`,
      link: "/seller/onboarding",
      entityId: `kyc:decision:${applicationId}`,
      metadata: { applicationId, decision, reason: trimmedReason },
    }).catch(() => {});
  }

  return outcome;
}

module.exports = { listQueue, decideKyc };
