const { badRequest, conflict, forbidden, notFound } = require("@reloop/shared");
const prisma = require("../../models/prismaClient");
const { assignRole } = require("../../services/authService");
const { lockUser } = require("../../services/sessionService");
const {
  persistDocument,
  removeDocument,
  assertDocumentExists,
} = require("./kycStorage");

/** Seller-facing submission — creates the seller_profiles row on first
 * submission (a seller can register without ever filling this in), and
 * always appends a fresh KycApplication row so decision history/evidence
 * survives resubmission after a rejection (mirrors adminKycService's
 * comment on why the two are kept separate).
 *
 * Statuses that allow (re-)submission:
 *   NONE / REJECTED — normal first-time or rejected flow
 *   EXPIRED         — seller's ID card has expired; they must re-upload a valid one
 *   INACTIVE_EXPIRED — seller was dormant for ≥1 year; re-verification before listing again
 */
async function submitKyc({
  userId,
  shopName,
  idCardNumber,
  idCardExpiry,
  address,
  bankAccount,
  verifyMethod,
  file,
}) {
  if (verifyMethod !== "thai_id" && !file) {
    throw badRequest("id card photo is required");
  }
  if (!shopName?.trim()) throw badRequest("shopName is required");
  if (!address?.trim()) throw badRequest("address is required");

  const cleanedIdCard = (idCardNumber || "").replace(/\D/g, "");
  if (cleanedIdCard.length !== 13) {
    throw badRequest("idCardNumber must be 13 digits");
  }

  // idCardExpiry is optional (permanent-card holders have no expiry).
  let parsedExpiry = null;
  if (idCardExpiry) {
    parsedExpiry = new Date(idCardExpiry);
    if (isNaN(parsedExpiry.getTime())) {
      throw badRequest("idCardExpiry must be a valid date (ISO 8601)");
    }
    if (parsedExpiry <= new Date()) {
      throw badRequest("idCardExpiry must be a future date");
    }
  }

  const storageKey = file ? await persistDocument(file) : "THAI_ID_METHOD";
  try {
    return await prisma.$transaction(async (tx) => {
      // Serialize submissions for one account. A second request waits, then
      // observes PENDING and rolls back instead of creating two applications.
      const user = await lockUser(tx, userId);
      if (!user) throw notFound("user not found");
      const sellerProfile = await tx.sellerProfile.findUnique({
        where: { userId },
      });
      const currentStatus = sellerProfile?.kycStatus;
      if (currentStatus === "VERIFIED") {
        throw conflict("this account is already verified");
      }
      if (currentStatus === "PENDING") {
        throw conflict("a verification application is already pending review");
      }

      // Role, legacy role, latest profile and immutable application history
      // commit together. A failure leaves none of these partially updated.
      await assignRole(userId, "SELLER", tx);
      if (user.role !== "SELLER") {
        await tx.user.update({
          where: { id: userId },
          data: { role: "SELLER" },
        });
      }

      const profileFields = {
        shopName: shopName.trim(),
        idCardNumber: cleanedIdCard,
        idCardExpiry: parsedExpiry,
        address: address.trim(),
        bankAccount: bankAccount?.trim() || null,
        kycStatus: "PENDING",
        kycStorageKey: storageKey,
      };
      await tx.sellerProfile.upsert({
        where: { userId },
        create: { userId, ...profileFields },
        update: profileFields,
      });
      const application = await tx.kycApplication.create({
        data: {
          userId,
          storageKey,
          fileType: file ? file.mimetype : "application/json",
          status: "PENDING",
        },
      });
      return { kycStatus: "PENDING", applicationId: application.id };
    });
  } catch (error) {
    try {
      await removeDocument(storageKey);
    } catch (cleanupError) {
      console.error(
        `[kyc] failed to remove orphan document ${storageKey}: ${cleanupError.message}`,
      );
    }
    throw error;
  }
}

async function getMine(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { sellerProfile: true },
  });
  if (!user) throw notFound("user not found");

  const latestApplication = await prisma.kycApplication.findFirst({
    where: { userId },
    orderBy: { submittedAt: "desc" },
  });

  return {
    kycStatus: user.sellerProfile?.kycStatus || "NONE",
    sellerProfile: user.sellerProfile
      ? {
          shopName: user.sellerProfile.shopName,
          idCardNumber: user.sellerProfile.idCardNumber,
          address: user.sellerProfile.address,
          bankAccount: user.sellerProfile.bankAccount,
          kycStatus: user.sellerProfile.kycStatus,
          verifiedAt: user.sellerProfile.verifiedAt,
        }
      : null,
    latestApplication: latestApplication
      ? {
          id: latestApplication.id,
          status: latestApplication.status,
          reason: latestApplication.reason,
          submittedAt: latestApplication.submittedAt,
          decidedAt: latestApplication.decidedAt,
        }
      : null,
  };
}

/** Owner can view their own document; an Admin/CS reviewer with
 * `admin:kyc:decide` can view any — same two-way gate as dispute evidence. */
async function viewDocument({ applicationId, userId, permissions, requestId }) {
  const application = await prisma.kycApplication.findUnique({
    where: { id: applicationId },
  });
  if (!application) throw notFound("application not found");

  const isOwner = application.userId === userId;
  const isReviewer = permissions?.includes("admin:kyc:decide");
  if (!isOwner && !isReviewer) {
    throw forbidden("not authorized to view this document");
  }

  if (application.storageKey === "THAI_ID_METHOD") {
    throw notFound("No document file (verified via Thai ID QR)");
  }

  const filePath = await assertDocumentExists(application.storageKey);
  await prisma.adminAudit.create({
    data: {
      actorId: userId,
      action: "KYC_DOCUMENT_VIEWED",
      targetId: applicationId,
      reason: isOwner
        ? "owner viewed KYC document"
        : "reviewer viewed KYC document",
      requestId,
    },
  });

  return {
    path: filePath,
    fileType: application.fileType,
  };
}

module.exports = { submitKyc, getMine, viewDocument };
