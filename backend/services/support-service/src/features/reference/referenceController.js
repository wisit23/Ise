const prisma = require("../../models/prismaClient");
const { customerServiceClientConfig } = require("@reloop/shared");

function clientConfig(req, res) {
  res.set("Cache-Control", "no-store");
  res.json(customerServiceClientConfig);
}

function categories(delegate) {
  return async (req, res, next) => {
    try {
      res.set("Cache-Control", "no-store");
      res.json({ items: await listCategories(delegate) });
    } catch (error) {
      next(error);
    }
  };
}

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

module.exports = {
  clientConfig,
  listCategories,
  ticketCategories: categories("ticketCategory"),
  helpCategories: categories("helpCategory"),
};
