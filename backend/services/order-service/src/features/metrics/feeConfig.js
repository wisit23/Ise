// The platform fee is a business rule, not a UI constant: order-service owns it
// and sends it with every revenue figure (`meta.platformFeeRate`), so the
// dashboard labels can never drift from the rate the revenue was computed at
// (CEO-DEC-005/008). Set PLATFORM_FEE_RATE (a fraction, 0.03 = 3%) in the
// environment; the default stays 3% until Finance confirms a fee schedule.
const DEFAULT_PLATFORM_FEE_RATE = 0.03;

/**
 * The configured fee rate as a fraction in [0, 1]. A malformed value throws
 * instead of silently falling back, so a typo can never quietly misprice every
 * revenue figure.
 */
function getPlatformFeeRate(env = process.env) {
  const raw = env.PLATFORM_FEE_RATE;
  if (raw === undefined || String(raw).trim() === "") {
    return DEFAULT_PLATFORM_FEE_RATE;
  }
  const rate = Number(raw);
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
    throw new Error(
      `PLATFORM_FEE_RATE must be a fraction between 0 and 1 (e.g. 0.03), got "${raw}"`,
    );
  }
  return rate;
}

// Fail at boot, not on the first request. An unset rate still works, but a
// server should set it on purpose, so say so in the startup log.
getPlatformFeeRate();
if (!String(process.env.PLATFORM_FEE_RATE ?? "").trim()) {
  console.warn(
    `[order-service] PLATFORM_FEE_RATE is not set; using the default ${DEFAULT_PLATFORM_FEE_RATE}. Set it in .env for production.`,
  );
}

module.exports = { getPlatformFeeRate, DEFAULT_PLATFORM_FEE_RATE };
