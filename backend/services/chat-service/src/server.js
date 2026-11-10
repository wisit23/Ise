require("dotenv").config();
const { requireEnv, createServiceRuntime } = require("@reloop/shared");

requireEnv(["DATABASE_URL"]);

const app = require("./app");
const { createSocketServer } = require("./realtime/socketServer");

const prisma = require("./models/prismaClient");
const runtime = createServiceRuntime({
  app,
  service: "chat-service",
  checks: [
    () => prisma.$runCommandRaw({ ping: 1 }),
    () => socketServer.checkReady(),
  ],
});
runtime.addResource(() => prisma.$disconnect());
runtime.installSignals();

const PORT = process.env.CHAT_PORT || 3004;
const server = runtime.server;
const socketServer = createSocketServer(server);
runtime.addDrain(() => socketServer.close());
runtime.addResource(() => require("./realtime/presence").disconnect());
runtime.addResource(() =>
  require("./middleware/rateLimit").closeRateLimitClient(),
);

const { startSupportSyncWorker } = require("./features/sync/supportSyncWorker");
runtime.addWorker(startSupportSyncWorker().stop);

server.listen(PORT, () => console.log(`[chat-service] listening on ${PORT}`));
