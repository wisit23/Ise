require("dotenv").config();
const {
  requireEnv,
  createServiceRuntime,
  startBackgroundWorkers,
} = require("@reloop/shared");

requireEnv(["DATABASE_URL"]);

const app = require("./app");
const orderModel = require("./models/orderModel");
const productClient = require("./services/productClient");
const checkoutSessionService = require("./features/checkoutSessions/checkoutSessionService");
const productSyncService = require("./services/productSyncService");
const attributionOutboxService = require("./services/attributionOutboxService");
const auctionSettlementService = require("./features/auctionSettlements/auctionSettlementService");
const orderLifecycleService = require("./services/orderLifecycleService");

const prisma = require("./models/prismaClient");
const runtime = createServiceRuntime({
  app,
  service: "order-service",
  checks: [() => prisma.$queryRaw`SELECT 1`],
});
runtime.addResource(() => prisma.$disconnect());
runtime.installSignals();

const PORT = process.env.ORDER_PORT || 3003;
runtime.server.listen(PORT, () => {
  console.log(`[order-service] listening on ${PORT}`);
  startBackgroundWorkers(() => {
    runtime.addWorker(
      require("@reloop/shared").startPeriodicTask(
        () => orderModel.cleanExpiredOrders(productClient),
        15000,
      ).stop,
    );
    runtime.addWorker(checkoutSessionService.startExpiryWorker().stop);
    runtime.addWorker(productSyncService.startWorker().stop);
    runtime.addWorker(attributionOutboxService.startWorker().stop);
    runtime.addWorker(
      require("@reloop/shared/src/caseRetention").startCaseRetention(
        require("./models/prismaClient"),
        require("./generated/prisma-client").Prisma,
        "disputes",
      ),
    );
    runtime.addWorker(auctionSettlementService.startWorker().stop);
    runtime.addWorker(orderLifecycleService.startWorker().stop);
  });
});
