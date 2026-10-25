const { badRequest, conflict, notFound } = require("@reloop/shared");

const include = {
  sellerProfile: { select: { shopName: true, kycStatus: true, verifiedAt: true } },
  roles: true,
};

async function findSupportUser(db, identifier) {
  if (typeof identifier !== "string" || !identifier.trim())
    throw badRequest("user identifier is required");
  const original = identifier.trim();
  const clean = original.replace(/^#/, "").trim();
  const referenceCode = require("@reloop/shared").normalizeReferenceCode(clean, "USR");
  const user = await db.user.findFirst({
    where: { OR: [...(referenceCode ? [{ referenceCode }] : []), { id: clean }, { email: clean }, { sellerProfile: { shopName: original } }] },
    include,
  });
  if (user) return user;

  // Older case views exposed only the first ten UUID characters.
  // Never guess when more than one account shares the displayed prefix.
  if (/^[a-f0-9]{8}[a-f0-9-]{0,27}$/i.test(clean)) {
    const matches = await db.user.findMany({
      where: { id: { startsWith: clean, mode: "insensitive" } },
      include,
      take: 2,
    });
    if (matches.length > 1)
      throw conflict("พบผู้ใช้มากกว่าหนึ่งคน กรุณาใช้รหัสผู้ใช้เต็มหรืออีเมล");
    if (matches.length === 1) return matches[0];
  }
  throw notFound("user not found");
}

module.exports = { findSupportUser };
