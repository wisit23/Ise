// Creates a new local dataset. Existing databases and volumes are never reset.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const dotenv = require('dotenv');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, '.env'), 'utf8');
const config = dotenv.parse(source);
const expand = value => value.replace(/\$\{(\w+)\}/g, (_, key) => config[key] || '');
const label = process.env.LOCAL_DATASET_LABEL || '20261011';
if (!/^\d{8}(?:_[a-z0-9]+)?$/.test(label)) throw new Error('Invalid local dataset label');
const originalUrl = new URL(expand(config.DATABASE_URL_AUTH));
if (!['localhost', '127.0.0.1', 'postgres'].includes(originalUrl.hostname)) throw new Error('Local PostgreSQL only');
const logs = path.join(root, 'tmp', 'local-dataset-' + label);
fs.mkdirSync(logs, { recursive: true });
function run(name, command, args, env = {}) {
  const result = spawnSync(command, args, { cwd: root, env: { ...process.env, ...config, ...env }, encoding: 'utf8', timeout: 240000 });
  fs.writeFileSync(path.join(logs, name + '.log'), (result.stdout || '') + (result.stderr || ''));
  if (result.status !== 0) throw new Error(name + ' failed; see ' + path.join(logs, name + '.log'));
  console.log(name + ' passed');
  return result.stdout.trim();
}
const urls = {};
for (const service of ['auth', 'product', 'order', 'support']) {
  const database = 'reloop_demo_' + label + '_' + service;
  const exists = run('exists-' + service, 'docker', ['exec', 'ise-postgres-1', 'psql', '-U', config.POSTGRES_USER, '-d', 'postgres', '-tAc', `SELECT 1 FROM pg_database WHERE datname='${database}'`]);
  if (!exists) run('create-' + service, 'docker', ['exec', 'ise-postgres-1', 'createdb', '-U', config.POSTGRES_USER, database]);
  const url = new URL(originalUrl); url.pathname = '/' + database; urls[service.toUpperCase()] = url.toString();
  const host = new URL(url); host.hostname = '127.0.0.1'; host.port = '5432';
  const databaseEnv = { DATABASE_URL: host.toString(), ['DATABASE_URL_' + service.toUpperCase()]: host.toString() };
  run('migrate-' + service, process.execPath, ['backend/services/' + service + '-service/prisma/migrate.js'], databaseEnv);
  if (service === 'auth' || service === 'product') run('seed-' + service, process.execPath, ['backend/services/' + service + '-service/prisma/seed.js'], databaseEnv);
  if (service === 'support') run('seed-support-reference', process.execPath, ['backend/services/support-service/prisma/seed.js'], { ...databaseEnv, CS_SEED_HELP_CONTENT: '0' });
}
const mongo = new URL(expand(config.DATABASE_URL_CHAT));
if (!['localhost', '127.0.0.1', 'mongo'].includes(mongo.hostname)) throw new Error('Local MongoDB only');
mongo.pathname = '/reloop_demo_' + label + '_chat'; urls.CHAT = mongo.toString();
const mongoHost = new URL(mongo); mongoHost.hostname = '127.0.0.1'; mongoHost.port = '27017'; mongoHost.searchParams.set('directConnection', 'true');
run('schema-chat', process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push', '--schema', 'backend/services/chat-service/prisma/schema.prisma', '--skip-generate'], { DATABASE_URL: mongoHost.toString() });
// Keep the complete previous environment in an ignored file for rollback.
const backup = path.join(root, '.env.pre-dataset-' + label + '.local');
if (!fs.existsSync(backup)) fs.writeFileSync(backup, source, { flag: 'wx' });
let next = source;
for (const [service, value] of Object.entries(urls)) next = next.replace(new RegExp('^DATABASE_URL_' + service + '=.*$', 'm'), 'DATABASE_URL_' + service + '=' + value);
fs.writeFileSync(path.join(root, '.env'), next);
fs.writeFileSync(path.join(logs, 'setup.json'), JSON.stringify({ label, environmentBackup: path.basename(backup), databases: Object.keys(urls).map(service => ({ service, database: new URL(urls[service]).pathname.slice(1) })), state: 'schema-and-reference-ready; workflow seeding pending' }, null, 2));
console.log('Fresh local schema ready; original databases retained. Next: start services and seed workflows.');
