// Explicit opt-in, disposable DB only. No db push/resolve/baseline guard bypass.
// ER_REHEARSAL_CONTAINER=... ER_REHEARSAL_DATABASE=product_luna_er node test/er-migration.rehearsal.js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const service = path.resolve(__dirname, "..");
const container = process.env.ER_REHEARSAL_CONTAINER;
const database = process.env.ER_REHEARSAL_DATABASE;
if (!container?.startsWith("ise-er-rehearsal-") || !["product_luna_er", "product_upgrade_final_er"].includes(database)) {
  throw new Error("Explicit rehearsal container and isolated Product upgrade database required");
}
const url = `postgresql://er_test:er_test@127.0.0.1:55439/${database}`;
const env = { ...process.env, DATABASE_URL: url, DATABASE_URL_PRODUCT: url };
function command(exe, args, options = {}, expected = 0) {
  const result = spawnSync(exe, args, { cwd: service, encoding: "utf8", env, ...options });
  if (expected === 0 && result.status !== 0) throw new Error(result.stdout + result.stderr);
  if (expected !== 0) assert.notEqual(result.status, 0, result.stdout + result.stderr);
  return result.stdout + result.stderr;
}
function sql(text, expected = 0, db = database) {
  return command("docker", ["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "er_test", "-d", db], { input: text }, expected);
}
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "product-er-baseline-"));
async function main() {
  sql(`CREATE DATABASE ${database};`, 0, "postgres");
  sql("CREATE TABLE unreviewed_legacy(id text);");
  assert.match(command(process.execPath, ["prisma/migrate.js"], {}, 1), /cutover BLOCKED/);
  sql("DROP TABLE unreviewed_legacy;");
  console.log("PASS existing unreviewed database guard");
  const baseline = "20261011000000_unified_product_baseline";
  fs.mkdirSync(path.join(temp, "migrations", baseline), { recursive: true });
  fs.copyFileSync(path.join(service, "prisma/schema.prisma"), path.join(temp, "schema.prisma"));
  fs.copyFileSync(path.join(service, "prisma/migrations", baseline, "migration.sql"), path.join(temp, "migrations", baseline, "migration.sql"));
  fs.copyFileSync(path.join(service, "prisma/migrations/migration_lock.toml"), path.join(temp, "migrations/migration_lock.toml"));
  command(process.execPath, [require.resolve("prisma/build/index.js"), "migrate", "deploy", "--schema", path.join(temp, "schema.prisma")]);
  sql(`
    INSERT INTO products(id,seller_id,title,price,category,condition,tags,updated_at) VALUES('legacy-p','seller','Preserved',100,'Legacy Category','Good','{}',now());
    INSERT INTO reviews(id,order_id,buyer_id,seller_id,rating,created_at) VALUES('legacy-r','legacy-order','buyer','seller',5,'2026-01-02');
    INSERT INTO review_photos(id,review_id,url,position,created_at) VALUES('shared-id','legacy-r','/uploads/old.jpg',0,'2026-01-03');
    INSERT INTO review_videos(id,review_id,url,position,created_at) VALUES('shared-id','legacy-r','/uploads/old.mp4',1,'2026-01-04');
    INSERT INTO auction_rounds(id,title,categories,submission_starts_at,submission_ends_at,auction_starts_at,auction_ends_at,cancellation_reason,cancelled_at,cancelled_by,updated_at)
      VALUES('legacy-round','Legacy Title',ARRAY['Legacy Category'],'2026-01-01','2026-01-02','2026-01-03','2026-01-04','Original reason','2026-01-03','known-actor',now());
    INSERT INTO auction_items(id,product_id,seller_id,status,starting_price,bid_increment,round_id,cancellation_reason,cancelled_at,cancelled_by,updated_at)
      VALUES('legacy-item','legacy-p','seller','cancelled',100,10,'legacy-round','Original item reason','2026-01-03','known-actor',now());
    INSERT INTO product_moderation_commands(idempotency_key,action,product_id,payload_hash,result,created_at)
      VALUES('legacy-command','REMOVE_PRODUCT','legacy-p','original-hash','{"id":"legacy-p","status":"removed"}','2026-01-05');
    INSERT INTO campaigns(id,code,name,discount_value,spent_budget,starts_at,ends_at,created_by_id,updated_at)
      VALUES('legacy-camp','LEGACY','Preserved campaign',10,12.34,'2026-01-01','2026-01-04','known-actor',now());
    INSERT INTO campaign_attributions(event_id,order_id,campaign_id,gross_amount,discount_amount,net_amount,completed_at)
      VALUES('legacy-event','legacy-order','legacy-camp',100,12.34,87.66,'2026-01-03');
  `);
  const relationSql = fs.readFileSync(path.join(service, "prisma/migrations/20261014010000_approved_er_product_relations/migration.sql"), "utf8");
  assert.match(sql(relationSql, 1), /unmatched condition/);
  assert.match(sql("SELECT to_regclass('product_categories') IS NULL;"), /t/);
  sql("INSERT INTO conditions(id,value,label) VALUES('good','Good','Good');");
  const auditSql = fs.readFileSync(path.join(service, "prisma/migrations/20261014020000_approved_er_audit_and_budget/migration.sql"), "utf8");
  sql("UPDATE campaigns SET spent_budget=99 WHERE id='legacy-camp';");
  assert.match(sql(auditSql, 1), /differs from attribution SUM/);
  assert.match(sql("SELECT count(*) FROM product_moderation_commands;"), /1/);
  sql("UPDATE campaigns SET spent_budget=12.34 WHERE id='legacy-camp';");
  console.log("PASS unmatched condition and budget mismatch rollback guards");
  command(process.execPath, ["prisma/migrate.js"]);
  command(process.execPath, ["prisma/migrate.js"]);
  const { PrismaClient } = require("../src/generated/prisma-client");
  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    const media = await db.reviewMedia.findMany({ orderBy: { position: "asc" } });
    assert.deepEqual(media.map((m) => [m.id, m.url, m.position, m.createdAt.toISOString()]), [
      ['image:shared-id','/uploads/old.jpg',0,'2026-01-03T00:00:00.000Z'],
      ['video:shared-id','/uploads/old.mp4',1,'2026-01-04T00:00:00.000Z'],
    ]);
    assert.equal(await db.productCategory.count(), 1);
    assert.equal(await db.countView.count(), 0);
    const { hydrateRound, hydrateItem } = require("../src/features/auctions/auctionAuditState");
    const round = await hydrateRound(db, await db.auctionRound.findUnique({ where: { id: 'legacy-round' } }));
    assert.equal(round.title, 'Legacy Title');
    assert.deepEqual(round.categories, ['Legacy Category']);
    assert.equal(round.cancellationReason, 'Original reason');
    assert.equal(round.cancelledBy, 'known-actor');
    assert.equal(round.cancelledAt.toISOString(), '2026-01-03T00:00:00.000Z');
    const item = await hydrateItem(db, await db.auctionItem.findUnique({ where: { id: 'legacy-item' } }));
    assert.equal(item.cancellationReason, 'Original item reason');
    const commandLog = await db.marketingAuditLog.findUnique({ where: { idempotencyKey: 'legacy-command' } });
    assert.deepEqual(commandLog.metadata.result, { id: 'legacy-p', status: 'removed' });
    assert.equal(commandLog.metadata.payloadHash, 'original-hash');
    assert.equal(commandLog.createdAt.toISOString(), '2026-01-05T00:00:00.000Z');
    const { withSpentBudget } = require('../src/features/campaigns/campaignBudget');
    assert.equal(Number((await withSpentBudget(db, await db.campaign.findUnique({ where: { id: 'legacy-camp' } }))).spentBudget),12.34);
    console.log('PASS upgrade preserved media IDs/URLs/order/time, condition/category, round/item state, moderation hash/result/time, decimal SUM; repeat deploy');
  } finally { await db.$disconnect(); }
  const diff = command(process.execPath, [require.resolve('prisma/build/index.js'),'migrate','diff','--from-url',url,'--to-schema-datamodel','prisma/schema.prisma','--script']);
  assert.match(diff, /empty migration/);
  console.log('PASS upgrade database/schema diff empty');
}
main().catch((err) => { console.error(err); process.exitCode = 1; }).finally(() => fs.rmSync(temp, { recursive: true, force: true }));
