require("dotenv").config();
if (process.env.DATABASE_URL_SUPPORT)
  process.env.DATABASE_URL = process.env.DATABASE_URL_SUPPORT;
const prisma = require("../src/models/prismaClient");
const { seedReferenceData } = require("./seedReferenceData");
seedReferenceData(prisma)
  .then(() =>
    console.log(
      "24x7 SLA reference policies ready; existing targets preserved",
    ),
  )
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
