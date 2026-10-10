const { sessionError } = require("@reloop/shared");
const prisma = require("../models/prismaClient");

function assertActive(user) {
  if (!user) throw revokedSession();
  if (user.status !== "ACTIVE") {
    throw sessionError(
      403,
      "ACCOUNT_SUSPENDED",
      "บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อฝ่ายช่วยเหลือ",
    );
  }
}

function revokedSession() {
  return sessionError(
    401,
    "SESSION_REVOKED",
    "เซสชันสิ้นสุดแล้ว กรุณาเข้าสู่ระบบใหม่",
  );
}

async function validateAccessSession(payload) {
  if (typeof payload.sub !== "string" || typeof payload.sid !== "string") {
    throw revokedSession();
  }
  const session = await prisma.refreshToken.findUnique({
    where: { id: payload.sid },
    include: { user: true },
  });
  if (!session || session.userId !== payload.sub) throw revokedSession();
  assertActive(session.user);
  if (session.revokedAt || session.expiresAt <= new Date())
    throw revokedSession();
}

// Used by session issuance and suspension/restoration so an in-flight login
// cannot insert a live session after the suspension has revoked all sessions.
async function lockUser(tx, userId) {
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
  return tx.user.findUnique({ where: { id: userId } });
}

module.exports = {
  assertActive,
  revokedSession,
  validateAccessSession,
  lockUser,
};
