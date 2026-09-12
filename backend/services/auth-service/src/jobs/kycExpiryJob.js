// Daily job: detects seller profiles whose submitted ID card has passed its
// expiry date and resets kycStatus to EXPIRED.
//
// Runs once at startup (after a short delay) and then every 24 hours.
// The check is idempotent so a duplicate run never double-expires anyone.
const prisma = require("../models/prismaClient");

const RUN_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 h
const START_DELAY_MS = 60 * 1000; // wait 1 min after boot before first run

async function runExpiryCheck() {
  const now = new Date();
  try {
    const result = await prisma.sellerProfile.updateMany({
      where: {
        kycStatus: "VERIFIED",
        // Only profiles that opted in to expiry tracking AND the date has passed.
        idCardExpiry: { not: null, lt: now },
      },
      data: {
        kycStatus: "EXPIRED",
        verifiedAt: null,
      },
    });

    if (result.count > 0) {
      console.log(
        `[kycExpiryJob] ${result.count} seller(s) set to EXPIRED (ID card past expiry)`,
      );
    }
  } catch (err) {
    console.error("[kycExpiryJob] error during expiry check:", err);
  }
}

function start() {
  // Delay first run to let the DB connection pool warm up after boot.
  setTimeout(() => {
    runExpiryCheck();
    setInterval(runExpiryCheck, RUN_INTERVAL_MS);
  }, START_DELAY_MS);

  console.log("[kycExpiryJob] scheduled — first run in 60 s, then every 24 h");
}

module.exports = { start, runExpiryCheck };
