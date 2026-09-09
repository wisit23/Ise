const { badRequest, conflict, forbidden, notFound } = require("@reloop/shared");
const prisma = require("../../models/prismaClient");
const { absolutePath } = require("./kycStorage");

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
  thaiIdFullName,
  thaiIdPhone,
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

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { sellerProfile: true },
  });
  if (!user) throw notFound("user not found");

  // Upgrade BUYER role to SELLER on first KYC submission.
  if (user.role !== "SELLER") {
    await prisma.user.update({
      where: { id: userId },
      data: { role: "SELLER" },
    });
  }

  const currentStatus = user.sellerProfile?.kycStatus;

  // VERIFIED with no re-verification trigger — nothing to do.
  if (currentStatus === "VERIFIED") {
    throw conflict("this account is already verified");
  }
  // A pending application is still awaiting admin review.
  if (currentStatus === "PENDING") {
    throw conflict("a verification application is already pending review");
  }
  // All other statuses (NONE, REJECTED, EXPIRED, INACTIVE_EXPIRED) are allowed to submit/resubmit.

  const profileFields = {
    shopName: shopName.trim(),
    idCardNumber: cleanedIdCard,
    idCardExpiry: parsedExpiry,
    address: address.trim(),
    bankAccount: bankAccount?.trim() || null,
    kycStatus: "PENDING",
    kycStorageKey: file ? file.filename : "THAI_ID_METHOD",
  };

  await prisma.sellerProfile.upsert({
    where: { userId },
    create: { userId, ...profileFields },
    update: profileFields,
  });

  const application = await prisma.kycApplication.create({
    data: {
      userId,
      storageKey: file ? file.filename : "THAI_ID_METHOD",
      fileType: file ? file.mimetype : "application/json",
      status: "PENDING",
    },
  });

  return { kycStatus: "PENDING", applicationId: application.id };
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
async function viewDocument({ applicationId, userId, permissions }) {
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

  return {
    path: absolutePath(application.storageKey),
    fileType: application.fileType,
  };
}

module.exports = { submitKyc, getMine, viewDocument };
