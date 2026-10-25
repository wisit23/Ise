const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  permissionsForRoles,
  ALL_ROLES,
  isValidRoleCombination,
  restrictionsForStatus,
  badRequest,
  conflict,
  notFound,
  STAFF_ROLES,
} = require("@reloop/shared");
const prisma = require("../models/prismaClient");
const { assertActive, revokedSession, lockUser } = require("./sessionService");
const { assertPasswordPolicy, hashPassword } = require("./passwordPolicy");
const { service: emailVerification } = require("../features/emailVerification");
const shopChangeRequests = require("./shopChangeRequestService");
const { ROLE_CATALOG } = require("../../prisma/roleCatalog");

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days, matches JWT_REFRESH_EXPIRES
const ROLE_ID_BY_CODE = new Map(ROLE_CATALOG.map(([id, code]) => [code, id]));
const MAX_AUTO_MESSAGES = 20;
const MAX_AUTO_MESSAGE_LENGTH = 100;

function validAutoMessageText(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw badRequest("กรุณากรอกคำถามอัตโนมัติ");
  }
  const text = value.trim();
  if (text.length > MAX_AUTO_MESSAGE_LENGTH) {
    throw badRequest(`คำถามอัตโนมัติต้องไม่เกิน ${MAX_AUTO_MESSAGE_LENGTH} ตัวอักษร`);
  }
  return text;
}

async function ensureRoleCatalogEntry(db, role) {
  const id = ROLE_ID_BY_CODE.get(role);
  if (!id) throw badRequest("unknown role");
  await db.roleDefinition.upsert({
    where: { code: role },
    update: {},
    create: { id, code: role },
  });
}

function toPublicUser(user) {
  return {
    id: user.id,
    ...(user.referenceCode ? { referenceCode: user.referenceCode } : {}),
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
async function getUserRoles(userId, db = prisma) {
  const assigned = await db.userRole.findMany({ where: { userId } });
  if (assigned.length > 0) return assigned.map((r) => r.role);

  const user = await db.user.findUnique({ where: { id: userId } });
  return user ? [user.role] : [];
}

/** Materializes UserRole rows from the legacy `role` column on first write, if needed. */
async function ensureRoleRowsMigrated(userId, db = prisma) {
  const existing = await db.userRole.findMany({ where: { userId } });
  if (existing.length > 0) return existing.map((r) => r.role);

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound("user not found");

  await ensureRoleCatalogEntry(db, user.role);
  await db.userRole.create({ data: { userId, role: user.role } });
  return [user.role];
}

async function assignRole(userId, role, db = prisma) {
  if (!ALL_ROLES.includes(role)) throw badRequest("unknown role");

  const currentRoles = await ensureRoleRowsMigrated(userId, db);
  const nextRoles = [...new Set([...currentRoles, role])];
  if (!isValidRoleCombination(nextRoles)) {
    throw conflict(
      "customer roles (BUYER/SELLER) cannot be combined with a staff role, and a staff account can have only one staff role",
    );
  }
  await ensureRoleCatalogEntry(db, role);
  await db.userRole.upsert({
    where: { userId_role: { userId, role } },
    update: {},
    create: { userId, role },
  });

  return getUserRoles(userId, db);
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

async function buildAccessTokenClaims(user, db = prisma) {
  const displayName = [user.firstName, user.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  const roles = await getUserRoles(user.id, db);
  const permissions = permissionsForRoles(roles);

  // Queried fresh (not trusted from the caller's `user` object) so a
  // just-decided VERIFIED status shows up the next time this user's access
  // token is refreshed (every 15m), without requiring re-login — same
  // staleness window roles/permissions already accept.
  const sellerProfile = await db.sellerProfile.findUnique({
    where: { userId: user.id },
    select: { kycStatus: true },
  });

  return {
    sub: user.id,
    role: user.role, // legacy single-role claim, kept for backward compatibility
    roles,
    permissions,
    kycVerified: sellerProfile?.kycStatus === "VERIFIED",
    // Full KYC status included so product-service can distinguish EXPIRED /
    // INACTIVE_EXPIRED without a cross-service DB lookup on every request.
    kycStatus: sellerProfile?.kycStatus ?? null,
    displayName: displayName || undefined,
    accountStatus: user.status,
    commerceRestrictions: restrictionsForStatus(user.status),
  };
}

async function issueTokenPair(user, loginContext = null) {
  return prisma.$transaction(async (tx) => {
    user = await lockUser(tx, user.id);
    assertActive(user);

    // jti guarantees uniqueness even if a user logs in twice within the same second
    // (same sub+role+iat would otherwise sign to the identical JWT string).
    const refreshToken = signRefreshToken({
      sub: user.id,
      role: user.role,
      jti: crypto.randomUUID(),
    });
    const session = await tx.refreshToken.create({
      data: {
        id: crypto.randomUUID(),
        userId: user.id,
        token: refreshToken,
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });

    if (loginContext) {
      await tx.loginLog.create({
        data: {
          userId: user.id,
          sessionId: session.id,
          ipAddress: loginContext.ipAddress,
          userAgent: loginContext.userAgent,
        },
      });
    }

    const accessToken = signAccessToken({
      ...(await buildAccessTokenClaims(user, tx)),
      sid: session.id,
    });
    return { accessToken, refreshToken };
  });
}

// Thai mobile/landline as typed into the forms: 10 digits starting with 0.
// Spaces and dashes are accepted on input ("081-234-5678") and stripped so
// what's stored is always the bare digits. Blank means "no phone" — the
// field is optional everywhere it's collected.
const PHONE_PATTERN = /^0[0-9]{9}$/;

function normalizePhone(phone) {
  if (phone === undefined || phone === null) return phone;
  const digits = String(phone).replace(/[\s-]/g, "");
  if (!digits) return null;
  if (!PHONE_PATTERN.test(digits)) {
    throw badRequest("เบอร์โทรศัพท์ต้องเป็นตัวเลข 10 หลัก ขึ้นต้นด้วย 0");
  }
  return digits;
}

/**
 * With verification required, the account starts unverified and the
 * response carries no session: the user signs in after confirming the
 * emailed link. With verification off, sign-up signs them straight in.
 */
async function register({ email, password, firstName, lastName, phone, ipAddress }) {
  if (!email || !password || !firstName || !lastName) {
    throw badRequest("email, password, firstName, lastName are required");
  }
  assertPasswordPolicy(password);
  phone = normalizePhone(phone);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && !(await emailVerification.canReclaim(existing))) {
    throw conflict("email is already registered");
  }

  const profile = { passwordHash: await hashPassword(password), firstName, lastName, phone };
  const user = existing
    ? await prisma.user.update({ where: { id: existing.id }, data: profile })
    : await prisma.user.create({ data: { email, ...profile, role: "BUYER" } });

  if (emailVerification.isRequired()) {
    const reference = emailVerification.sendForNewAccount(user, { ipAddress });
    return {
      verificationRequired: true,
      email: user.email,
      expiresInHours: emailVerification.linkLifetimeHours(),
      reference,
    };
  }
  const tokens = await issueTokenPair(user);
  return { user: toPublicUser(user), ...tokens };
}

async function login({ email, password, ipAddress, userAgent }) {
  if (!email || !password) throw badRequest("email and password are required");

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw badRequest("invalid email or password");

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw badRequest("invalid email or password");
  assertActive(user);
  emailVerification.assertVerifiedForSignIn(user);

  const tokens = await issueTokenPair(user, { ipAddress, userAgent });
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

  return prisma.$transaction(async (tx) => {
    const user = await lockUser(tx, payload.sub);
    assertActive(user);
    const stored = await tx.refreshToken.findUnique({
      where: { token: refreshToken },
    });
    if (
      !stored ||
      stored.userId !== payload.sub ||
      stored.revokedAt ||
      stored.expiresAt < new Date()
    ) {
      throw revokedSession();
    }

    const accessToken = signAccessToken({
      ...(await buildAccessTokenClaims(user, tx)),
      sid: stored.id,
    });
    return { accessToken };
  });
}

async function logout(refreshToken) {
  if (!refreshToken) return;
  const session = await prisma.refreshToken.findUnique({
    where: { token: refreshToken },
    select: { id: true },
  });
  if (!session) return;

  const loggedOutAt = new Date();
  await prisma.$transaction([
    prisma.refreshToken.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: loggedOutAt },
    }),
    prisma.loginLog.updateMany({
      where: { sessionId: session.id, logoutAt: null },
      data: { logoutAt: loggedOutAt },
    }),
  ]);
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
  if (phone !== undefined) patch.phone = normalizePhone(phone);

  const user = await prisma.user.update({ where: { id: userId }, data: patch });
  return toPublicUser(user);
}

// A caller could otherwise hand over an unbounded id list and pull the whole
// user table back in one request.
const MAX_DISPLAY_NAME_IDS = 100;

/**
 * Display names for a batch of user ids — the ONLY way another service can
 * turn a userId into something human-readable, and deliberately reachable
 * only through /internal (x-internal-token, never proxied by the gateway).
 *
 * Returns a FIRST NAME, never the full legal name: a marketplace
 * counterparty needs to tell one person from another, not to learn who they
 * legally are. That's `NFR-SP-02`'s "ปกปิดข้อมูลส่วนบุคคลที่สำคัญในหน้าจอทั่วไป"
 * applied to chat, and it matches how Grab/Airbnb/Shopee show a counterparty.
 *
 * Sellers resolve to their shop name instead — a shop name is a business
 * identity that is already fully public on the storefront, and it's what a
 * buyer actually recognises. Note this is driven by "does this account have
 * a shop name", NOT by a role check: nothing here gates on BUYER vs SELLER.
 *
 * Unknown ids are simply absent from the result rather than throwing, so one
 * deleted account can't break a whole conversation's rendering.
 */
async function getDisplayNames(userIds) {
  if (!Array.isArray(userIds)) throw badRequest("userIds must be an array");
  const unique = [...new Set(userIds.filter((id) => typeof id === "string"))];
  if (unique.length === 0) return [];
  if (unique.length > MAX_DISPLAY_NAME_IDS) {
    throw badRequest(`userIds is limited to ${MAX_DISPLAY_NAME_IDS} per call`);
  }

  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: {
      id: true,
      firstName: true,
      referenceCode: true,
      role: true,
      roles: { select: { role: true } },
      sellerProfile: { select: { shopName: true } },
    },
  });

  // `staffRoles` lists only staff roles (ADMIN, TRUST_AND_SAFETY,
  // CUSTOMER_SERVICE) and is empty for customers, so a screen can say which
  // team acted on a case without learning anything about a buyer or seller.
  return users.map((user) => {
    // Role rows win over the legacy column, as everywhere else in auth.
    const held = user.roles.length
      ? user.roles.map((row) => row.role)
      : [user.role];
    return {
      userId: user.id,
      displayName: user.sellerProfile?.shopName || user.firstName,
      ...(user.referenceCode ? { referenceCode: user.referenceCode } : {}),
      staffRoles: STAFF_ROLES.filter((role) => held.includes(role)),
    };
  });
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
    ...(user.referenceCode ? { referenceCode: user.referenceCode } : {}),
    firstName: user.firstName,
    lastName: user.lastName,
    shopName: user.sellerProfile?.shopName || null,
    memberSince: user.createdAt,
    kycStatus: user.sellerProfile?.kycStatus || "NONE",
  };
}

/** Fetch the authenticated seller's own shop profile (includes private fields). */
async function getMyShopProfile(userId) {
  const profile = await prisma.sellerProfile.findUnique({
    where: { userId },
  });
  if (!profile) throw notFound("seller profile not found");
  return {
    shopName: profile.shopName,
    address: profile.address,
    bankAccount: profile.bankAccount,
  };
}

/** Seller submits a request to change their shop profile fields.
 *  At least one of shopName/address/bankAccount must be provided, plus a comment. */
async function submitShopChangeRequest(sellerId, payload) {
  return shopChangeRequests.submit(sellerId, payload);
}

/** Seller fetches their own change-request history. */
async function listMyChangeRequests(sellerId) {
  return shopChangeRequests.listMine(sellerId);
}

/** Admin fetches all PENDING shop change requests (with seller info). */
async function listPendingChangeRequests() {
  return shopChangeRequests.listPending();
}

/** Admin approves or rejects a shop change request.
 *  If approved, applies the changed fields to the SellerProfile. */
async function decideChangeRequest(adminId, requestId, payload) {
  return shopChangeRequests.decide(adminId, requestId, payload);
}

/** Auto Messages (FAQ / Quick questions for buyer chat initiation) */
async function listMyAutoMessages(sellerId) {
  return prisma.autoMessage.findMany({
    where: { userId: sellerId },
    orderBy: { id: "asc" },
  });
}

async function createAutoMessage(sellerId, { messageText, isActive = true } = {}) {
  const text = validAutoMessageText(messageText);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const count = await tx.autoMessage.count({ where: { userId: sellerId } });
        if (count >= MAX_AUTO_MESSAGES) {
          throw conflict(`เพิ่มคำถามอัตโนมัติได้ไม่เกิน ${MAX_AUTO_MESSAGES} ข้อต่อร้าน`);
        }
        return tx.autoMessage.create({
          data: { userId: sellerId, messageText: text, isActive: Boolean(isActive) },
        });
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (error?.code !== "P2034") throw error;
    }
  }
  throw conflict("มีการเพิ่มคำถามพร้อมกัน กรุณาลองอีกครั้ง");
}

async function updateAutoMessage(sellerId, messageId, { messageText, isActive } = {}) {
  const existing = await prisma.autoMessage.findFirst({
    where: { id: messageId, userId: sellerId },
  });
  if (!existing) throw notFound("auto message not found");

  const data = {};
  if (messageText !== undefined) {
    data.messageText = validAutoMessageText(messageText);
  }
  if (isActive !== undefined) {
    data.isActive = Boolean(isActive);
  }

  return prisma.autoMessage.update({
    where: { id: messageId },
    data,
  });
}

async function deleteAutoMessage(sellerId, messageId) {
  const existing = await prisma.autoMessage.findFirst({
    where: { id: messageId, userId: sellerId },
  });
  if (!existing) throw notFound("auto message not found");

  await prisma.autoMessage.delete({
    where: { id: messageId },
  });
  return { success: true };
}

async function getPublicAutoMessages(sellerId) {
  const messages = await prisma.autoMessage.findMany({
    where: { userId: sellerId, isActive: true },
    orderBy: { id: "asc" },
    take: MAX_AUTO_MESSAGES,
    select: { id: true, messageText: true },
  });
  return messages.map((m) => ({
    id: m.id,
    messageText: m.messageText.slice(0, MAX_AUTO_MESSAGE_LENGTH),
  }));
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  getById,
  updateProfile,
  getPublicSellerProfile,
  getDisplayNames,
  getMyShopProfile,
  submitShopChangeRequest,
  listMyChangeRequests,
  listPendingChangeRequests,
  decideChangeRequest,
  listMyAutoMessages,
  createAutoMessage,
  updateAutoMessage,
  deleteAutoMessage,
  getPublicAutoMessages,
  getUserRoles,
  assignRole,
  removeRole,
};
