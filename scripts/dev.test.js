const test = require('node:test');
const assert = require('node:assert/strict');
const { main } = require('./dev.cjs');
function fixture(fail) {
  const calls = [];
  const run = (args) => {
    calls.push(args);
    if (fail?.(args)) throw new Error('fixture failure');
    if (args[0] === 'config') return JSON.stringify({ services: { frontend: { environment: {} } } });
  };
  return { calls, run };
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
for (const failure of ['--wait', 'prisma/migrate.js', 'push', 'prisma/seed.js']) {
  test(`failure at ${failure} prevents application startup`, () => {
    const { calls, run } = fixture(a => a.includes(failure));
    assert.throws(() => main(run, () => true), /fixture failure/);
    assert.ok(!calls.some(a => a[0] === 'up' && a.includes('frontend')));
    if (failure === 'prisma/migrate.js') assert.ok(!calls.some(a => a.includes('prisma/seed.js')));
  });
}
test('missing env and production configuration cause no bootstrap writes', () => {
  const { calls, run } = fixture();
  assert.throws(() => main(run, () => false), /Missing .env/);
  assert.equal(calls.length, 0);
  assert.throws(() => main(() => JSON.stringify({ services: { frontend: { environment: { NODE_ENV: 'production' } } } }), () => true), /local development/);
});
