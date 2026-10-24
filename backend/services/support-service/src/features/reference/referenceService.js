const prisma = require("../../models/prismaClient");

/** Active categories for a lookup table ("ticketCategory" or "helpCategory").
 * `db` is injectable for tests. */
async function listCategories(delegate, db = prisma) {
  const rows = await db[delegate].findMany({
    where: { isActive: true },
    orderBy: { id: "asc" },
    select: { code: true, nameTh: true, nameEn: true },
  });
  return rows.map((row) => ({
    value: row.code,
    label: row.nameTh || row.nameEn || row.code,
  }));
}

module.exports = { listCategories };
