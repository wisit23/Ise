const { PrismaClient } = require("../generated/prisma-client");

const prisma = new PrismaClient({ ...(process.env.DATABASE_URL_SUPPORT ? {datasources:{db:{url:process.env.DATABASE_URL_SUPPORT}}} : {}) });

module.exports = prisma;
