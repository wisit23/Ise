process.env.DATABASE_URL_ORDER ||=
  process.env.DATABASE_URL ||
  "postgresql://reloop:reloop_dev_password@127.0.0.1:5432/reloop_order";
const { backfillAndValidateHolds } = require("../src/services/holdBackfillService");

async function run() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(`[TSR-02] Starting hold backfill and ambiguity audit (dryRun: ${dryRun})...`);

  try {
    const result = await backfillAndValidateHolds({ dryRun });
    console.log(`[TSR-02] Completed:`);
    console.log(`  - Scanned orders: ${result.scannedOrdersCount}`);
    console.log(`  - Created/Pending holds: ${result.createdHoldsCount}`);
    console.log(`  - Synchronized orders: ${result.updatedOrdersCount || 0}`);
    console.log(`  - Ambiguous orders detected: ${result.ambiguousOrdersCount}`);

    if (result.ambiguousOrdersCount > 0) {
      console.warn(`\n[WARNING] Found ambiguous orders requiring manual review:`);
      console.table(result.ambiguousOrders);
    } else {
      console.log(`  - No ambiguous orders found. Database is consistent.`);
    }

    process.exit(0);
  } catch (err) {
    console.error("[ERROR] Failed to run backfill:", err);
    process.exit(1);
  }
}

run();
