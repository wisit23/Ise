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
  run(['up', '-d', 'postgres', 'redis', 'mongo', 'mongo-init']);
  run(['up', '-d', '--wait', '--wait-timeout', '180', 'postgres', 'redis', 'mongo']);
  run(['build', ...apps]);
  // Quiesce existing applications before schema changes; database volumes stay.
  run(['stop', ...apps]);
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
function defaultRun(args, capture = false) {
  const result = spawnSync('docker', ['compose', ...args], {
    cwd: root,
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
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
