require("dotenv").config();
const { requireEnv, createServiceRuntime } = require("@reloop/shared");

requireEnv(["DATABASE_URL"]);

const app = require("./app");
const slaMonitor = require("./features/sla/slaMonitor");

const prisma = require("./models/prismaClient");
const runtime = createServiceRuntime({
  app,
  service: "support-service",
  checks: [() => prisma.$queryRaw`SELECT 1`],
});
runtime.addResource(() => prisma.$disconnect());
runtime.installSignals();

const PORT = process.env.SUPPORT_PORT || 3006;
runtime.server.listen(PORT, () =>
  console.log(`[support-service] listening on ${PORT}`),
);
runtime.addWorker(slaMonitor.start().stop);
runtime.addWorker(
  require("@reloop/shared/src/caseRetention").startCaseRetention(
    require("./models/prismaClient"),
    require("./generated/prisma-client").Prisma,
    "tickets",
  ),
);
