const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  permissionsForRoles,
  ALL_ROLES,
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
  };
}

/**
 * A user with no explicit UserRole rows resolves to their legacy single
 * `role` column — this is what makes existing Buyer/Seller accounts keep
 * working without a bulk backfill migration (ADM-001 Step 4).
 */
async function getUserRoles(userId) {
  const assigned = await prisma.userRole.findMany({ where: { userId } });
  if (assigned.length > 0) return assigned.map((r) => r.role);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  return user ? [user.role] : [];
}

/** Materializes UserRole rows from the legacy `role` column on first write, if needed. */
async function ensureRoleRowsMigrated(userId) {
  const existing = await prisma.userRole.findMany({ where: { userId } });
  if (existing.length > 0) return existing.map((r) => r.role);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound("user not found");

  await prisma.userRole.create({ data: { userId, role: user.role } });
  return [user.role];
}

async function assignRole(userId, role) {
  if (!ALL_ROLES.includes(role)) throw badRequest("unknown role");

  await ensureRoleRowsMigrated(userId);
  await prisma.userRole.upsert({
    where: { userId_role: { userId, role } },
    update: {},
    create: { userId, role },
  });

  return getUserRoles(userId);
}

async function removeRole(userId, role) {
  if (!ALL_ROLES.includes(role)) throw badRequest("unknown role");

  await ensureRoleRowsMigrated(userId);
  const remaining = await prisma.userRole.findMany({ where: { userId } });
  if (remaining.length <= 1 && remaining.some((r) => r.role === role)) {
    throw conflict("user must retain at least one role");
  }

  await prisma.userRole.deleteMany({ where: { userId, role } });
  return getUserRoles(userId);
}

async function buildAccessTokenClaims(user) {
  const displayName = [user.firstName, user.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  const roles = await getUserRoles(user.id);
  const permissions = permissionsForRoles(roles);

  // Queried fresh (not trusted from the caller's `user` object) so a
  // just-decided VERIFIED status shows up the next time this user's access
  // token is refreshed (every 15m), without requiring re-login — same
  // staleness window roles/permissions already accept.
  const sellerProfile = await prisma.sellerProfile.findUnique({
    where: { userId: user.id },
    select: { kycStatus: true },
  });

  return {
    sub: user.id,
    role: user.role, // legacy single-role claim, kept for backward compatibility
    roles,
    permissions,
    kycVerified: sellerProfile?.kycStatus === "VERIFIED",
    displayName: displayName || undefined,
  };
}

async function issueTokenPair(user) {
  // jti guarantees uniqueness even if a user logs in twice within the same second
  // (same sub+role+iat would otherwise sign to the identical JWT string).
  const accessToken = signAccessToken(await buildAccessTokenClaims(user));
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
  });

  const tokens = await issueTokenPair(user);
  return { user: toPublicUser(user), ...tokens };
}

async function login({ email, password, ipAddress }) {
  if (!email || !password) throw badRequest("email and password are required");

  const user = await prisma.user.findUnique({ where: { email } });
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
    include: { user: true },
  });
  if (
    !stored ||
    stored.userId !== payload.sub ||
    stored.revokedAt ||
    stored.expiresAt < new Date()
  ) {
    throw badRequest("refresh token is no longer valid");
  }

  const accessToken = signAccessToken(
    await buildAccessTokenClaims(stored.user),
  );
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
  const user = await prisma.user.findUnique({ where: { id: userId } });
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

  const user = await prisma.user.update({ where: { id: userId }, data: patch });
  return toPublicUser(user);
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
    // Real trust signal for the storefront: a buyer-facing "verified seller"
    // badge is only honest if it reflects the actual KYC state, not just
    // "this account has the SELLER role" (every seller gets that at
    // registration, before any verification happens).
    kycStatus: user.sellerProfile?.kycStatus || "NONE",
  };
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  getById,
  updateProfile,
  getPublicSellerProfile,
  getUserRoles,
  assignRole,
  removeRole,
};
