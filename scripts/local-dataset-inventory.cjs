const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const dotenv = require('dotenv');
const env = dotenv.parse(fs.readFileSync(process.argv[2] || '.env'));
function expand(value) { return value.replace(/\$\{(\w+)\}/g, (_, key) => env[key] || ''); }
function sql(database, query) {
  const result = spawnSync('docker', ['exec', 'ise-postgres-1', 'psql', '-U', env.POSTGRES_USER, '-d', database, '-tAc', query], { encoding: 'utf8', timeout: 15000 });
  if (result.status !== 0) throw new Error(result.stderr || result.error?.message);
  return result.stdout.trim();
}
const summary = {};
for (const service of ['AUTH', 'PRODUCT', 'ORDER', 'SUPPORT']) {
  const database = new URL(expand(env['DATABASE_URL_' + service])).pathname.slice(1);
  const tables = JSON.parse(sql(database, "SELECT coalesce(json_agg(tablename), '[]') FROM pg_tables WHERE schemaname='public' AND tablename<>'_prisma_migrations'"));
  const counts = {};
  for (const table of tables) counts[table] = Number(sql(database, 'SELECT count(*) FROM "' + table.replaceAll('"', '""') + '"'));
  summary[service] = { database, counts };
}
console.log(JSON.stringify(summary, null, 2));
