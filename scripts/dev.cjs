// Local bootstrap: guarded migrations and non-resetting demo seeds before apps.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const apps = ['auth-service', 'product-service', 'order-service', 'support-service', 'chat-service', 'gateway', 'frontend'];
function main(run = defaultRun, exists = fs.existsSync) {
  if (!exists(path.join(root, '.env'))) {
    throw new Error('Missing .env. Copy .env.example to .env and configure local development first.');
  }
  // Read effective Compose configuration, including any user override. Refuse
  // production settings rather than accidentally bootstrap demo users in prod.
  const config = JSON.parse(run(['config', '--format', 'json'], true));
  if (config.services.frontend.environment?.NODE_ENV === 'production') {
    throw new Error('npm run dev is for local development. Use deploy.sh for production.');
  }
  const databaseSql = databaseProvisioningSql(config);
  run(['up', '-d', 'postgres', 'redis', 'mongo', 'mongo-init']);
  run(['up', '-d', '--wait', '--wait-timeout', '180', 'postgres', 'redis', 'mongo']);
  run(['build', ...apps]);
  // Quiesce existing applications before schema changes; database volumes stay.
  run(['stop', ...apps]);
  run(['exec', '-T', 'postgres', 'psql', '-X', '--set', 'ON_ERROR_STOP=1', '-U',
    config.services.postgres.environment.POSTGRES_USER, '-d', 'postgres'], false, databaseSql);
  for (const service of apps.slice(0, 4)) {
    run(['run', '--rm', '--no-deps', service, 'node', 'prisma/migrate.js']);
  }
  run(['run', '--rm', '--no-deps', 'chat-service', 'npx', 'prisma', 'db', 'push', '--skip-generate']);
  for (const service of apps.slice(0, 4)) {
    run(['run', '--rm', '--no-deps', '-e', 'RELOOP_RESEED_DEMO=0', '-e', 'CS_SEED_HELP_CONTENT=1', service, 'node', 'prisma/seed.js']);
  }
  console.log('Local database setup completed. Starting applications (Ctrl+C to stop).');
  run(['up', ...apps]);
}
function databaseProvisioningSql(config) {
  const literal = value => "'" + value.replace(/'/g, "''") + "'";
  const statements = new Set();
  for (const service of apps.slice(0, 4)) {
    const url = new URL(config.services[service].environment.DATABASE_URL);
    // Only provision the PostgreSQL instance managed by this Compose project.
    if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
        url.hostname !== 'postgres' || (url.port && url.port !== '5432')) {
      throw new Error(`${service} DATABASE_URL must target postgres:5432 for local bootstrap.`);
    }
    const database = decodeURIComponent(url.pathname.slice(1));
    const owner = decodeURIComponent(url.username);
    if (!database || !owner) throw new Error(`${service} DATABASE_URL needs a database and user.`);
    // format(%I) quotes identifiers; the existence check preserves existing DBs.
    statements.add(`SELECT format('CREATE DATABASE %I OWNER %I', ${literal(database)}, ${literal(owner)}) WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = ${literal(database)});\n\\gexec`);
  }
  return [...statements].join('\n') + '\n';
}
function defaultRun(args, capture = false, input) {
  const result = spawnSync('docker', ['compose', ...args], {
    cwd: root,
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : [input === undefined ? 'inherit' : 'pipe', 'inherit', 'inherit'],
    ...(input === undefined ? {} : { input }),
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`docker compose ${args[0]} failed (exit ${result.status}).`);
  return result.stdout;
}
if (require.main === module) {
  mainErrorBoundary();
}
function mainErrorBoundary() {
  try { main(); } catch (error) {
    console.error('[dev] ' + error.message);
    console.error('Startup stopped. Existing data was retained; do not delete volumes to bypass a migration error. Applications may be stopped. Resolve the error and rerun npm run dev.');
    process.exitCode = 1;
  }
}
module.exports = { main };
