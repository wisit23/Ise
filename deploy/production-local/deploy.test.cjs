/* global __dirname */
const process = require('node:process');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
// Already installed through the repository's ESLint dependency tree.
const yaml = require('js-yaml');
const root = path.resolve(__dirname, '../..');
const render = (directory) => yaml.loadAll(execFileSync('kubectl', ['kustomize', directory], { cwd: root, encoding: 'utf8' }));
const prod = render('deploy/production-local');
const dev = render('deploy/k8s');
const names = ['auth-service', 'product-service', 'order-service', 'support-service', 'chat-service', 'gateway', 'frontend'];
const deployment = (documents, name) => documents.find(d => d.kind === 'Deployment' && d.metadata.name === name);

test('production-local has its own namespace and no development namespace', () => {
  assert.deepEqual(prod.filter(d => d.kind === 'Namespace').map(d => d.metadata.name), ['reloop-production-local']);
  for (const d of prod.filter(d => d.kind !== 'Namespace')) assert.equal(d.metadata.namespace, 'reloop-production-local');
  assert.equal(prod.find(d => d.kind === 'Namespace').metadata.labels['reloop-mode'], 'production-local');
});

test('production starts servers, never schema mutations or dev servers', () => {
  assert.equal(prod.find(d => d.kind === 'ConfigMap' && d.metadata.name === 'reloop-config').data.NODE_ENV, 'production');
  for (const name of names) {
    const pod = deployment(prod, name).spec.template.spec;
    assert.equal(pod.securityContext.runAsNonRoot, true);
    assert.equal(pod.automountServiceAccountToken, false);
    const c = pod.containers[0];
    assert.doesNotMatch([...(c.command || []), ...(c.args || [])].join(' '), /db push|migrate|run dev/);
    if (name.endsWith('-service')) assert.deepEqual(c.command, ['node', 'src/server.js']);
    if (name === 'frontend') assert.deepEqual(c.command, ['npm', 'run', 'start']);
    assert.ok(c.readinessProbe);
    assert.equal(c.imagePullPolicy, 'Never');
    assert.equal(c.image, `reloop/production-local-${name}:unbuilt`);
  }
});

test('all file-writing services have persistent storage at the new image paths', () => {
  const claims = new Set(prod.filter(d => d.kind === 'PersistentVolumeClaim').map(d => d.metadata.name));
  for (const name of ['auth-service', 'product-service', 'order-service', 'chat-service']) {
    const pod = deployment(prod, name).spec.template.spec;
    for (const mount of pod.containers[0].volumeMounts) {
      assert.ok(mount.mountPath.startsWith(`/app/backend/services/${name}/`));
      assert.ok(claims.has(pod.volumes.find(v => v.name === mount.name).persistentVolumeClaim.claimName));
    }
    assert.equal(pod.securityContext.fsGroup, 1000);
  }
});

test('database init is preserved and Redis queues/sessions use persistent AOF storage', () => {
  assert.equal(prod.filter(d => d.kind === 'Job' && d.metadata.name === 'mongo-init').length, 1);
  assert.equal(prod.filter(d => d.kind === 'StatefulSet').length, 2);
  const redis = deployment(prod, 'redis');
  assert.equal(redis.spec.strategy.type, 'Recreate');
  assert.deepEqual(redis.spec.template.spec.containers[0].args, ['--appendonly', 'yes', '--appendfsync', 'everysec']);
  assert.equal(redis.spec.template.spec.volumes[0].persistentVolumeClaim.claimName, 'redis-data');
  assert.ok(prod.some(d => d.kind === 'PersistentVolumeClaim' && d.metadata.name === 'redis-data'));
  assert.equal(deployment(dev, 'redis').spec.template.spec.volumes, undefined);
});

test('development render remains development-only', () => {
  assert.equal(dev.find(d => d.kind === 'Namespace').metadata.name, 'reloop');
  assert.equal(dev.find(d => d.kind === 'ConfigMap' && d.metadata.name === 'reloop-config').data.NODE_ENV, 'development');
  assert.match(deployment(dev, 'frontend').spec.template.spec.containers[0].args.join(' '), /run dev/);
  assert.match(deployment(dev, 'auth-service').spec.template.spec.containers[0].args.join(' '), /db push/);
});

test('rendered documents split into seven apps and infrastructure as the script expects', () => {
  const text = execFileSync('kubectl', ['kustomize', 'deploy/production-local'], { cwd: root, encoding: 'utf8' });
  const documents = text.split(/^---[ \t]*\r?$/m).filter(d => d.trim());
  const apps = documents.filter(d => /^kind: Deployment\s*$/m.test(d) && !/^ {2}name: redis\s*$/m.test(d));
  assert.equal(apps.length, 7);
  assert.equal(documents.length - apps.length, 23);
  for (const doc of apps) assert.ok(names.includes(yaml.load(doc).metadata.name));
});

test('build uses Node 24, lockfile, production Next build, and excludes sensitive context', () => {
  const dockerfile = fs.readFileSync(path.join(__dirname, 'Dockerfile'), 'utf8');
  assert.match(dockerfile, /FROM node:24-bookworm-slim/);
  assert.match(dockerfile, /package-lock.json/);
  assert.match(dockerfile, /npm ci/);
  assert.match(dockerfile, /RUN npm run build/);
  assert.match(dockerfile, /ARG NEXT_PUBLIC_API_URL=http:\/\/localhost:8080/);
  const ignore = fs.readFileSync(path.join(root, '.dockerignore'), 'utf8');
  for (const pattern of ['**/secrets*.env', '**/.state', '**/private-kyc-documents', '**/private-evidence', '**/private-attachments']) assert.ok(ignore.includes(pattern));
});

test('Windows PowerShell -File resolves default secrets after parameter binding', { skip: process.platform !== 'win32' }, () => {
  const source = fs.readFileSync(path.join(__dirname, 'deploy.ps1'), 'utf8');
  const end = source.indexOf("$Cluster =");
  assert.ok(end > 0);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'reloop-cli-'));
  try {
    // Execute the real initialization only: never install tools or contact a cluster.
    const probe = path.join(directory, 'deploy.ps1');
    fs.copyFileSync(path.join(__dirname, 'environment.ps1'), path.join(directory, 'environment.ps1'));
    fs.copyFileSync(path.join(__dirname, 'ports.ps1'), path.join(directory, 'ports.ps1'));
    fs.writeFileSync(probe, source.slice(0, end) + '\nWrite-Output $SecretsFile\n');
    const invoke = (args) => execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', probe, '-CreateCluster', '-Migrate', ...args], { cwd: root, encoding: 'utf8', timeout: 15000 }).trim();
    assert.equal(invoke([]), path.resolve(directory, '../..', '.env'));
    const alias = path.join(directory, 'custom.env');
    assert.equal(invoke(['-EnvFile', alias]), alias);
    const custom = path.join(directory, 'custom secrets.env');
    assert.equal(invoke(['-SecretsFile', custom]), custom);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('only frontend and gateway publish stable NodePorts; data services stay internal', () => {
  const services = prod.filter(d => d.kind === 'Service');
  for (const service of services) {
    const expected = { frontend: 30080, gateway: 30081 }[service.metadata.name];
    if (expected) {
      assert.equal(service.spec.type, 'NodePort');
      assert.equal(service.spec.ports[0].nodePort, expected);
    } else {
      assert.notEqual(service.spec.type, 'NodePort');
      assert.ok(service.spec.ports.every(p => !p.nodePort));
    }
  }
});

test('existing-cluster local exposure is safe and needs no rebuild or migration', { skip: process.platform !== 'win32' }, () => {
  const output = execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'test-ports.ps1')], { cwd: root, encoding: 'utf8', timeout: 30000 });
  assert.ok(output.includes('PASS: local ports setup, ownership, reuse, loopback binding and host HTTP checks'));
});

test('dotenv parsing and production validation run without a cluster', { skip: process.platform !== 'win32' }, () => {
  const output = execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'test-environment.ps1')], { cwd: root, encoding: 'utf8', timeout: 15000 });
  assert.ok(output.includes('PASS: dotenv parsing and production environment gates'));
});

test('kind bootstrap installs only when missing and fails closed offline', { skip: process.platform !== 'win32' }, () => {
  const output = execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'test-prerequisites.ps1')], { cwd: root, encoding: 'utf8', timeout: 30000 });
  assert.ok(output.includes('PASS: PATH refresh'));
  for (const scenario of ['existing', 'stale-path', 'install', 'no-winget', 'install-failure', 'not-on-path', 'non-windows', 'broken-kind']) assert.ok(output.includes(`PASS: kind bootstrap ${scenario}`));
});

test('PowerShell consumer handles successful update and fail-closed gates offline', { skip: process.platform !== 'win32' }, () => {
  const output = execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'test-script.ps1')], { cwd: root, encoding: 'utf8', timeout: 60000 });
  for (const scenario of ['docker-unavailable', 'unmarked-namespace', 'active-job', 'ephemeral-redis', 'schema-change', 'build-failure', 'job-failure']) assert.ok(output.includes(`PASS: ${scenario}`));
  assert.ok(output.includes('PASS: normal update'));
  assert.ok(output.includes('PASS: five explicit migration Jobs'));
});
