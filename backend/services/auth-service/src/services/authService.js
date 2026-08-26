const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  badRequest,
  conflict,
  notFound,
} = require("@reloop/shared");
const prisma = require("../models/prismaClient");

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days, matches JWT_REFRESH_EXPIRES

function toPublicUser(user) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    role: user.role,
    sellerProfile: user.sellerProfile
      ? {
          shopName: user.sellerProfile.shopName,
          idCardNumber: user.sellerProfile.idCardNumber,
          address: user.sellerProfile.address,
          kycStatus: user.sellerProfile.kycStatus,
          kycDocumentUrl: user.sellerProfile.kycDocumentUrl,
          rejectionReason: user.sellerProfile.rejectionReason,
          verifiedAt: user.sellerProfile.verifiedAt,
        }
      : null,
  };
}

async function issueTokenPair(user) {
  // jti guarantees uniqueness even if a user logs in twice within the same second
  // (same sub+role+iat would otherwise sign to the identical JWT string).
  const accessToken = signAccessToken({ sub: user.id, role: user.role });
  const refreshToken = signRefreshToken({
    sub: user.id,
    role: user.role,
    jti: crypto.randomUUID(),
  });

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      token: refreshToken,
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    },
  });

  return { accessToken, refreshToken };
}

const REGISTERABLE_ROLES = ["BUYER", "SELLER"];

async function register({
  email,
  password,
  firstName,
  lastName,
  phone,
  role,
  shopName,
}) {
  if (!email || !password || !firstName || !lastName) {
    throw badRequest("email, password, firstName, lastName are required");
  }
  if (password.length < 8) {
    throw badRequest("password must be at least 8 characters");
  }

  const resolvedRole = role || "BUYER";
  if (!REGISTERABLE_ROLES.includes(resolvedRole)) {
    throw badRequest("role must be BUYER or SELLER");
  }
  if (resolvedRole === "SELLER" && !shopName) {
    throw badRequest("shopName is required to register a seller account");
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw conflict("email is already registered");

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      firstName,
      lastName,
      phone,
      role: resolvedRole,
      ...(resolvedRole === "SELLER"
        ? { sellerProfile: { create: { shopName } } }
        : {}),
    },
    include: { sellerProfile: true },
  });

  const tokens = await issueTokenPair(user);
  return { user: toPublicUser(user), ...tokens };
}

async function login({ email, password, ipAddress }) {
  if (!email || !password) throw badRequest("email and password are required");

  const user = await prisma.user.findUnique({
    where: { email },
    include: { sellerProfile: true },
  });
  if (!user) throw badRequest("invalid email or password");

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw badRequest("invalid email or password");

  await prisma.loginLog.create({ data: { userId: user.id, ipAddress } });

  const tokens = await issueTokenPair(user);
  return { user: toPublicUser(user), ...tokens };
}

async function refresh(refreshToken) {
  if (!refreshToken) throw badRequest("refreshToken is required");

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw badRequest("invalid or expired refresh token");
  }

  const stored = await prisma.refreshToken.findUnique({
    where: { token: refreshToken },
  });
  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw badRequest("refresh token is no longer valid");
  }

  const accessToken = signAccessToken({ sub: payload.sub, role: payload.role });
  return { accessToken };
}

async function logout(refreshToken) {
  if (!refreshToken) return;
  await prisma.refreshToken.updateMany({
    where: { token: refreshToken, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

async function getById(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { sellerProfile: true },
  });
  if (!user) throw badRequest("user not found");
  return toPublicUser(user);
}

async function updateProfile(userId, { firstName, lastName, phone }) {
  const patch = {};
  if (firstName !== undefined) {
    if (!firstName) throw badRequest("firstName cannot be empty");
    patch.firstName = firstName;
  }
  if (lastName !== undefined) {
    if (!lastName) throw badRequest("lastName cannot be empty");
    patch.lastName = lastName;
  }
  if (phone !== undefined) patch.phone = phone;

  const user = await prisma.user.update({
    where: { id: userId },
    data: patch,
    include: { sellerProfile: true },
  });
  return toPublicUser(user);
}

/** Submit seller identity verification (KYC) and upgrade account to SELLER. */
async function submitKyc(userId, {
  firstName,
  lastName,
  phone,
  idCardNumber,
  idCardImageUrl,
  kycDocumentUrl,
  address,
  shopName,
  bankAccount,
}) {
  if (!firstName || !firstName.trim()) throw badRequest("กรุณาระบุชื่อจริง (firstName)");
  if (!lastName || !lastName.trim()) throw badRequest("กรุณาระบุนามสกุล (lastName)");
  if (!phone || !phone.trim()) throw badRequest("กรุณาระบุเบอร์โทรศัพท์ (phone)");
  if (!idCardNumber || !idCardNumber.trim()) throw badRequest("กรุณาระบุรหัสบัตรประชาชน 13 หลัก (idCardNumber)");

  const cleanedIdCard = idCardNumber.replace(/\D/g, "");
  if (cleanedIdCard.length !== 13) {
    throw badRequest("รหัสบัตรประชาชนต้องเป็นตัวเลข 13 หลัก");
  }

  if (!address || !address.trim()) throw badRequest("กรุณาระบุที่อยู่ (address)");
  
  const documentUrl = kycDocumentUrl || idCardImageUrl;
  if (!documentUrl || !documentUrl.trim()) {
    throw badRequest("กรุณาอัปโหลดรูปภาพบัตรประชาชน (kycDocumentUrl/idCardImageUrl)");
  }

  const existingUser = await prisma.user.findUnique({
    where: { id: userId },
    include: { sellerProfile: true },
  });
  if (!existingUser) throw notFound("ไม่พบผู้ใช้งานในระบบ");

  const resolvedShopName =
    (shopName && shopName.trim()) ||
    existingUser.sellerProfile?.shopName ||
    `ร้านค้าของ ${firstName.trim()}`;

  // Update user profile & role to SELLER
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone.trim(),
      role: "SELLER",
      sellerProfile: {
        upsert: {
          create: {
            shopName: resolvedShopName,
            idCardNumber: cleanedIdCard,
            address: address.trim(),
            kycDocumentUrl: documentUrl.trim(),
            bankAccount: bankAccount ? bankAccount.trim() : null,
            kycStatus: "VERIFIED",
            verifiedAt: new Date(),
          },
          update: {
            shopName: resolvedShopName,
            idCardNumber: cleanedIdCard,
            address: address.trim(),
            kycDocumentUrl: documentUrl.trim(),
            bankAccount: bankAccount ? bankAccount.trim() : null,
            kycStatus: "VERIFIED",
            rejectionReason: null,
            verifiedAt: new Date(),
          },
        },
      },
    },
    include: { sellerProfile: true },
  });

  // Issue new token pair with updated SELLER role
  const tokens = await issueTokenPair(updatedUser);

  return {
    user: toPublicUser(updatedUser),
    ...tokens,
  };
}

async function getKycStatus(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { sellerProfile: true },
  });
  if (!user) throw notFound("ไม่พบผู้ใช้งาน");

  return {
    userId: user.id,
    role: user.role,
    kycStatus: user.sellerProfile?.kycStatus || "NONE",
    sellerProfile: user.sellerProfile
      ? {
          shopName: user.sellerProfile.shopName,
          idCardNumber: user.sellerProfile.idCardNumber,
          address: user.sellerProfile.address,
          kycStatus: user.sellerProfile.kycStatus,
          kycDocumentUrl: user.sellerProfile.kycDocumentUrl,
          rejectionReason: user.sellerProfile.rejectionReason,
          verifiedAt: user.sellerProfile.verifiedAt,
        }
      : null,
  };
}

/** Public store-front info for a seller — no email/phone, only what a buyer needs to see. */
async function getPublicSellerProfile(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { sellerProfile: true },
  });
  if (!user || user.role !== "SELLER") throw notFound("seller not found");

  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    shopName: user.sellerProfile?.shopName || null,
    memberSince: user.createdAt,
  };
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  getById,
  updateProfile,
  submitKyc,
  getKycStatus,
  getPublicSellerProfile,
};
