// Daily job: detects verified sellers who have had no listing activity for
// 365 days and resets kycStatus to INACTIVE_EXPIRED.
//
// "Last active" is defined as the later of:
//   - sellerProfile.lastActiveAt  (set by the internal activity endpoint)
//   - sellerProfile.verifiedAt    (fallback: a newly-verified seller with no
//     listings yet should start their inactivity clock from verification)
//
// The check is idempotent — re-running it never double-transitions anyone.
const prisma = require("../models/prismaClient");

const RUN_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 h
const START_DELAY_MS = 2 * 60 * 1000; // 2 min after boot (stagger from kycExpiryJob)
const INACTIVITY_THRESHOLD_DAYS = 365;

async function runInactivityCheck() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - INACTIVITY_THRESHOLD_DAYS);

  try {
    // Find verified sellers where the effective last-active timestamp is
    // before the cutoff.  We check two cases:
    //   1. lastActiveAt is set and is before cutoff
    //   2. lastActiveAt is null and verifiedAt is before cutoff
    //      (seller was verified but never listed anything)
    const stale = await prisma.sellerProfile.findMany({
      where: {
        kycStatus: "VERIFIED",
        OR: [
          { lastActiveAt: { lt: cutoff } },
          { lastActiveAt: null, verifiedAt: { lt: cutoff } },
        ],
      },
      select: { userId: true },
    });

    if (stale.length === 0) return;

    const ids = stale.map((p) => p.userId);
    await prisma.sellerProfile.updateMany({
      where: { userId: { in: ids } },
      data: {
        kycStatus: "INACTIVE_EXPIRED",
        verifiedAt: null,
      },
    });

    console.log(
      `[sellerInactivityJob] ${stale.length} seller(s) set to INACTIVE_EXPIRED (no activity for ${INACTIVITY_THRESHOLD_DAYS} days)`,
    );
  } catch (err) {
    console.error("[sellerInactivityJob] error during inactivity check:", err);
  }
}

function start() {
  setTimeout(() => {
    runInactivityCheck();
    setInterval(runInactivityCheck, RUN_INTERVAL_MS);
  }, START_DELAY_MS);

  console.log(
    "[sellerInactivityJob] scheduled — first run in 2 min, then every 24 h",
  );
}

module.exports = { start, runInactivityCheck };
