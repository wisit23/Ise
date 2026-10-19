const prisma = require("../../models/prismaClient");

const CUSTOMER_ROLES = ["BUYER", "SELLER"];

function createMarketingAudienceRepository(db = prisma) {
  async function listBuyerProfiles({ skip, take }) {
    const where = {
      status: "ACTIVE",
      OR: [
        {
          AND: [
            { roles: { some: { role: { in: CUSTOMER_ROLES } } } },
            { roles: { every: { role: { in: CUSTOMER_ROLES } } } },
          ],
        },
        { roles: { none: {} }, role: { in: CUSTOMER_ROLES } },
      ],
    };
    const [items, total] = await Promise.all([
      db.user.findMany({
        where,
        skip,
        take,
        orderBy: { id: "asc" },
        select: {
          id: true,
          buyerProfile: {
            select: {
              preferences: {
                orderBy: [
                  { kind: "asc" },
                  { category: "asc" },
                  { value: "asc" },
                ],
                select: { kind: true, category: true, value: true },
              },
            },
          },
        },
      }),
      db.user.count({ where }),
    ]);
    return { items, total };
  }

  return { listBuyerProfiles };
}

module.exports = createMarketingAudienceRepository();
module.exports.createMarketingAudienceRepository =
  createMarketingAudienceRepository;
