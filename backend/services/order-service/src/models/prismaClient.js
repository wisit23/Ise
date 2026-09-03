const { PrismaClient } = require("../generated/prisma-client");

const databaseUrl = process.env.DATABASE_URL_ORDER || process.env.DATABASE_URL;
const prisma = new PrismaClient({
  ...(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : {}),
});

module.exports = prisma;
