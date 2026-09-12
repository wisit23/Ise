let PrismaClient;
try {
  ({ PrismaClient } = require("../generated/prisma-client"));
} catch {
  PrismaClient = class DummyPrismaClient {};
}

const databaseUrl =
  process.env.DATABASE_URL_PRODUCT || process.env.DATABASE_URL;
const prisma = new PrismaClient({
  ...(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : {}),
});

module.exports = prisma;
