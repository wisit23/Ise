const { badRequest, conflict, forbidden, notFound } = require("@reloop/shared");
const prisma = require("../../models/prismaClient");
const { absolutePath } = require("./kycStorage");

/** Seller-facing submission — creates the seller_profiles row on first
 * submission (a seller can register without ever filling this in), and
 * always appends a fresh KycApplication row so decision history/evidence
 * survives resubmission after a rejection (mirrors adminKycService's
 * comment on why the two are kept separate). */
async function submitKyc({ userId, shopName, idCardNumber, address, bankAccount, file }) {
  if (!file) throw badRequest("id card photo is required");
  if (!shopName?.trim()) throw badRequest("shopName is required");
  if (!address?.trim()) throw badRequest("address is required");

  const cleanedIdCard = (idCardNumber || "").replace(/\D/g, "");
  if (cleanedIdCard.length !== 13) {
    throw badRequest("idCardNumber must be 13 digits");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { sellerProfile: true },
  });
  if (!user) throw notFound("user not found");
  if (user.role !== "SELLER") {
    throw forbidden("only seller accounts can submit seller verification");
  }
  if (user.sellerProfile?.kycStatus === "VERIFIED") {
    throw conflict("this account is already verified");
  }
  if (user.sellerProfile?.kycStatus === "PENDING") {
    throw conflict("a verification application is already pending review");
  }

  const profileFields = {
    shopName: shopName.trim(),
    idCardNumber: cleanedIdCard,
    address: address.trim(),
    bankAccount: bankAccount?.trim() || null,
    kycStatus: "PENDING",
    kycStorageKey: file.filename,
  };

  await prisma.sellerProfile.upsert({
    where: { userId },
    create: { userId, ...profileFields },
    update: profileFields,
  });

  const application = await prisma.kycApplication.create({
    data: {
      userId,
      storageKey: file.filename,
      fileType: file.mimetype,
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

  return {
    path: absolutePath(application.storageKey),
    fileType: application.fileType,
  };
}

module.exports = { submitKyc, getMine, viewDocument };
