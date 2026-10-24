const { badRequest } = require("@reloop/shared");
const prisma = require("../../models/prismaClient");

async function listBannedAccountHistory({ page, limit, role = "ALL", search = "" }, db = prisma) {
  if (!["ALL", "BUYER", "SELLER"].includes(role)) throw badRequest("invalid account role");
  const banned = await db.adminAudit.findMany({
    where: { action: "USER_SUSPENDED" },
    distinct: ["targetId"],
    select: { targetId: true },
  });
  if (!banned.length) return { items: [], total: 0 };

  const roles = role === "ALL" ? ["BUYER", "SELLER"] : [role];
  const query = search.trim();
  const accounts = await db.user.findMany({
    where: {
      id: { in: banned.map((entry) => entry.targetId) },
      AND: [
        { OR: [
          { roles: { some: { role: { in: roles } } } },
          { roles: { none: {} }, role: { in: roles } },
        ] },
        ...(query ? [{ OR: [
          { id: { contains: query, mode: "insensitive" } },
          { firstName: { contains: query, mode: "insensitive" } },
          { lastName: { contains: query, mode: "insensitive" } },
          { sellerProfile: { is: { shopName: { contains: query, mode: "insensitive" } } } },
        ] }] : []),
      ],
    },
    select: {
      id: true, firstName: true, lastName: true, role: true, status: true,
      roles: { select: { role: true } },
      sellerProfile: { select: { shopName: true } },
    },
  });
  if (!accounts.length) return { items: [], total: 0 };
  const byId = new Map(accounts.map((account) => [account.id, account]));
  const where = { action: "USER_SUSPENDED", targetId: { in: [...byId.keys()] } };
  const [audits, total] = await Promise.all([
    db.adminAudit.findMany({
      where,
      select: {
        id: true, targetId: true, reason: true, createdAt: true,
        actor: { select: { firstName: true, lastName: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.adminAudit.count({ where }),
  ]);
  return { items: audits.map((audit) => ({ ...audit, account: byId.get(audit.targetId) })), total };
}

module.exports = { listBannedAccountHistory };
