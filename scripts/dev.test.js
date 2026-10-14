const test = require('node:test');
const assert = require('node:assert/strict');
const { main } = require('./dev.cjs');
function fixture(fail, databaseUrl) {
  const calls = [];
  const inputs = [];
  const services = {
    frontend: { environment: {} },
    postgres: { environment: { POSTGRES_USER: 'reloop' } },
  };
  for (const service of ['auth', 'product', 'order', 'support']) {
    services[service + '-service'] = { environment: {
      DATABASE_URL: databaseUrl || `postgresql://reloop:secret@postgres:5432/demo_${service}`,
    } };
  }
  const run = (args, capture, input) => {
    calls.push(args);
    if (input !== undefined) inputs.push(input);
    if (fail?.(args)) throw new Error('fixture failure');
    if (args[0] === 'config') return JSON.stringify({ services });
  };
  return { calls, run, inputs };
}
test('dev waits for databases and migrates all services before seeding and starting apps', () => {
  const { calls, run } = fixture();
  main(run, () => true);
  const migrations = calls.filter(a => a.includes('prisma/migrate.js'));
  const seeds = calls.filter(a => a.includes('prisma/seed.js'));
  assert.equal(migrations.length, 4);
  assert.equal(seeds.length, 4);
  assert.ok(calls.findIndex(a => a.includes('--wait')) < calls.indexOf(migrations[0]));
  assert.ok(calls.indexOf(migrations.at(-1)) < calls.indexOf(seeds[0]));
  assert.ok(seeds.every(a => a.includes('RELOOP_RESEED_DEMO=0')));
  assert.ok(calls.some(a => a.includes('push') && !a.includes('--accept-data-loss')));
  assert.equal(calls.at(-1)[0], 'up');
  assert.ok(calls.at(-1).includes('frontend'));
  assert.ok(!calls.flat().some(a => ['down', '-v', 'reset', '--force-reset', '--accept-data-loss'].includes(a)));
});
for (const failure of ['--wait', 'psql', 'prisma/migrate.js', 'push', 'prisma/seed.js']) {
  test(`failure at ${failure} prevents application startup`, () => {
    const { calls, run } = fixture(a => a.includes(failure));
    assert.throws(() => main(run, () => true), /fixture failure/);
    assert.ok(!calls.some(a => a[0] === 'up' && a.includes('frontend')));
    if (failure === 'prisma/migrate.js') assert.ok(!calls.some(a => a.includes('prisma/seed.js')));
  });
}
test('custom databases are provisioned after health and before migrations without resetting existing databases', () => {
  const { calls, run, inputs } = fixture();
  main(run, () => true);
  const provisioning = calls.findIndex(args => args.includes('psql'));
  assert.ok(calls.findIndex(args => args.includes('--wait')) < provisioning);
  assert.ok(provisioning < calls.findIndex(args => args.includes('prisma/migrate.js')));
  assert.equal(inputs.length, 1);
  for (const service of ['auth', 'product', 'order', 'support'])
    assert.ok(inputs[0].includes(`'demo_${service}'`));
  assert.equal(inputs[0].match(/WHERE NOT EXISTS/g).length, 4);
  assert.ok(!/DROP|ALTER|TRUNCATE/.test(inputs[0]));
});
test('remote database configuration is rejected before starting or stopping containers', () => {
  const { calls, run } = fixture(undefined, 'postgresql://reloop:secret@remote:5432/demo_auth');
  assert.throws(() => main(run, () => true), /must target postgres:5432/);
  assert.equal(calls.length, 1);
});
test('database names and owners are safely quoted and duplicate databases are provisioned once', () => {
  const { run, inputs } = fixture(undefined, 'postgresql://user%27name:secret@postgres:5432/demo%27name');
  main(run, () => true);
  assert.equal(inputs[0].match(/CREATE DATABASE/g).length, 1);
  assert.ok(inputs[0].includes("'demo''name', 'user''name'"));
});
test('missing env and production configuration cause no bootstrap writes', () => {
  const { calls, run } = fixture();
  assert.throws(() => main(run, () => false), /Missing .env/);
  assert.equal(calls.length, 0);
  assert.throws(() => main(() => JSON.stringify({ services: { frontend: { environment: { NODE_ENV: 'production' } } } }), () => true), /local development/);
});
