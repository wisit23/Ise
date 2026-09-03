// Every bounded-batch action Admin can run lives here as one entry — the
// engine in bulkActionService.js never branches on the action name itself,
// it only looks the name up in this registry. Adding a new action later
// (e.g. AUCTION_DECISION, once Auction exists — see decision.md ADM-DEC-015)
// means adding one entry below; nothing about the engine, route, cap,
// dry-run or idempotency handling needs to change.
//
// Handler contract:
//   permission: string          — checked against the caller's permissions before running
//   preview({ id, adminId })    — read-only: what WOULD happen, for dryRun
//   execute({ id, reason, adminId }) — the real side effect for one id
const reportService = require("../reports/reportService");
const prisma = require("../../models/prismaClient");

const registry = {
  SUSPEND_USER: {
    permission: "admin:user:suspend",
    async preview({ id }) {
      const user = await prisma.user.findUnique({ where: { id } });
      if (!user) return { ok: false, reason: "user not found" };
      if (user.status === "SUSPENDED") {
        return { ok: false, reason: "user is already suspended" };
      }
      return { ok: true };
    },
    async execute({ id, reason, adminId }) {
      return reportService.suspendUser({ targetId: id, adminId, reason });
    },
  },
};

function getAction(name) {
  return registry[name];
}

module.exports = { getAction, registry };
