// Internal service: records the timestamp of a seller's most recent listing
// activity (product create or update) so the daily sellerInactivityJob can
// decide whether the seller has been dormant for ≥365 days.
//
// Note: this does NOT auto-restore an INACTIVE_EXPIRED seller — they must
// re-submit KYC and be approved by an admin first.  Activity recording here
// only prevents a freshly-active VERIFIED seller from being flagged.
const prisma = require("../../models/prismaClient");

async function recordActivity(sellerId) {
  // Upsert so the first call for a newly-registered seller (whose
  // sellerProfile might not exist yet) doesn't throw.
  await prisma.sellerProfile.updateMany({
    where: { userId: sellerId },
    data: { lastActiveAt: new Date() },
  });
}

module.exports = { recordActivity };
