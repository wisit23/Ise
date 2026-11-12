const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { startBackgroundWorkers } = require("./backgroundWorkers");

// Execute the real entrypoints against dependency boundaries. No databases,
// sockets, timers or queues are started by this test.
for (const [app, expected] of Object.entries({
  auth: 3,
  order: 7,
  product: 4,
  chat: 1,
  support: 2,
})) {
  test(`${app} standby serves HTTP without starting business jobs`, async () => {
    for (const enabled of [false, true]) {
      const jobs = [];
      let listening = false;
      let realtime = false;
      const worker = (name) => () => {
        jobs.push(name);
        return { stop() {} };
      };
      const runtime = {
        addWorker() {},
        addResource() {},
        addDrain() {},
        installSignals() {},
        server: {
          listen(port, callback) {
            listening = true;
            callback();
          },
        },
      };
      const shared = {
        requireEnv() {},
        createServiceRuntime: () => runtime,
        startBackgroundWorkers: (start) =>
          startBackgroundWorkers(start, {
            BACKGROUND_WORKERS_ENABLED: String(enabled),
          }),
        startPeriodicTask: worker("periodic"),
      };
      const prisma = { $disconnect() {} };
      const modules = {
        dotenv: { config() {} },
        "@reloop/shared": shared,
        "@reloop/shared/src/caseRetention": {
          startCaseRetention: worker("retention"),
        },
        "./app": () => {},
        "./models/prismaClient": prisma,
        "./generated/prisma-client": { Prisma: {} },
        "./models/orderModel": {},
        "./services/productClient": {},
        "./features/checkoutSessions/checkoutSessionService": {
          startExpiryWorker: worker("checkout"),
        },
        "./services/productSyncService": { startWorker: worker("productSync") },
        "./services/attributionOutboxService": {
          startWorker: worker("outbox"),
        },
        "./features/auctionSettlements/auctionSettlementService": {
          startWorker: worker("settlement"),
        },
        "./services/orderLifecycleService": {
          startWorker: worker("lifecycle"),
        },
        "./features/auctions/auctionService": {
          get() {},
          restoreScheduledJobs() {
            jobs.push("restore");
            return Promise.resolve();
          },
        },
        "./jobs/auctionCloseQueue": {
          startWorker: worker("auction"),
          closeQueue() {},
          stopWorker() {},
        },
        "./features/reservations/reservationService": {
          startReservationExpiryWorker: worker("reservations"),
        },
        "./features/campaigns/campaignService": {
          startCampaignExpiryWorker: worker("campaign"),
        },
        "./features/auctions/auctionRealtime": {
          startRelay() {
            realtime = true;
            return Promise.resolve();
          },
        },
        ioredis: class Redis {
          duplicate() {
            return new this.constructor();
          }
          on() {}
        },
        "./realtime/socketServer": {
          createSocketServer() {
            realtime = true;
            return {};
          },
        },
        "./features/sync/supportSyncWorker": {
          startSupportSyncWorker: worker("supportSync"),
        },
        "./features/sla/slaMonitor": { start: worker("sla") },
      };
      for (const name of [
        "kycExpiryJob",
        "sellerInactivityJob",
        "oneTimeTokenCleanupJob",
      ])
        modules[`./jobs/${name}`] = { start: worker(name) };
      const filename = path.resolve(
        __dirname,
        `../../services/${app}-service/src/server.js`,
      );
      vm.runInNewContext(
        fs.readFileSync(filename, "utf8"),
        {
          require(name) {
            assert.ok(
              Object.hasOwn(modules, name),
              `Unstubbed dependency: ${name}`,
            );
            return modules[name];
          },
          process: { env: {} },
          console: { log() {}, warn() {}, error() {} },
        },
        { filename },
      );
      await Promise.resolve();
      assert.equal(listening, true);
      assert.equal(jobs.length, enabled ? expected : 0, jobs.join(","));
      if (["product", "chat"].includes(app)) assert.equal(realtime, true);
    }
  });
}
