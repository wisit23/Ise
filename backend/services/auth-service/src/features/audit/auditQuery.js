const prisma = require("../../models/prismaClient");

async function queryAudit({ page, limit, actorId, action, targetId }) {
  const where = {
    ...(actorId ? { actorId } : {}),
    ...(action ? { action } : {}),
    ...(targetId ? { targetId } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.adminAudit.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.adminAudit.count({ where }),
  ]);
  return { items, total };
}

module.exports = { queryAudit };
