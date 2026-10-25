// Audit-only reproductions: actual application functions, in-memory persistence.
// No HTTP listeners, real DB writes, real uploads, or application source edits.
const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const Module = require('node:module');
const root = path.resolve(__dirname, '../..');
const fromRoot = p => require(path.join(root, p));

test('R1: product uploader accepts HTML extension when MIME claims image/png', () => {
  const { upload } = fromRoot('backend/services/product-service/src/middleware/upload');
  let accepted = false;
  const file = { originalname: 'audit.html', mimetype: 'image/png' };
  upload.fileFilter({}, file, (error, ok) => { assert.ifError(error); accepted = ok; });
  assert.equal(accepted, true);
  upload.storage.getFilename({}, file, (error, name) => {
    assert.ifError(error);
    assert.equal(path.extname(name), '.html');
  });
  console.log('R1: HTML accepted; generated public filename retains .html');
});

test('R2: showing a reserved or auction product resets its commerce status', async t => {
  const prisma = fromRoot('backend/services/product-service/src/models/prismaClient');
  const model = fromRoot('backend/services/product-service/src/models/productModel');
  let row;
  const previous = prisma.product;
  prisma.product = { findUnique: async () => ({ ...row }), updateMany: async ({ data }) => {
    Object.assign(row, data); return { count: 1 };
  } };
  t.after(() => { prisma.product = previous; });
  for (const status of ['reserved', 'auction', 'auction_action_required']) {
    row = { id: 'p1', sellerId: 's1', status, preRemovalStatus: null,
      moderatedAt: null, reservationId: 'active-reservation' };
    const result = await model.setVisibility('p1', true);
    assert.equal(result.status, 'available');
    console.log(`R2: ${status} + visible=true -> ${result.status}`);
  }
});

test('R3: socket handshake does not validate a live session', t => {
  const shared = require(path.join(root, 'backend/shared'));
  t.mock.method(process, 'emitWarning', () => {});
  const previous = process.env.JWT_ACCESS_SECRET;
  process.env.JWT_ACCESS_SECRET = 'ci-test-audit-only-not-an-application-secret';
  try {
    const { verifySocketAuth } = fromRoot('backend/services/chat-service/src/realtime/socketAuth');
    // Token is cryptographically valid, but deliberately has no session ID.
    const token = shared.signAccessToken({ sub: 'audit-seller', role: 'SELLER' });
    const socket = { handshake: { auth: { token } }, data: {} };
    let accepted = false;
    verifySocketAuth(socket, error => { assert.ifError(error); accepted = true; });
    assert.equal(accepted, true);
    console.log('R3: JWT with no session identity accepted by socket middleware');
  } finally {
    if (previous === undefined) delete process.env.JWT_ACCESS_SECRET;
    else process.env.JWT_ACCESS_SECRET = previous;
  }
});

test('R4: hidden product payload is emitted globally to authenticated sockets', () => {
  const broadcast = fromRoot('backend/services/chat-service/src/realtime/broadcast');
  const emitted = [];
  broadcast.setIo({ emit: (...args) => emitted.push(args),
    of: () => ({ emit() {} }), to: () => ({ emit() {} }) });
  try {
    const product = { id: 'hidden-1', sellerId: 'seller-1', status: 'hidden', title: 'private listing' };
    broadcast.broadcastRealtime({ event: 'product:updated', data: { product },
      rooms: ['user:seller-1'], broadcastGlobal: true });
    assert.deepEqual(emitted, [['product:updated', { product }]]);
    console.log('R4: default namespace global emit contains full hidden product');
  } finally { broadcast.setIo(null); }
});

test('R5: EXPIRED seller can submit an existing product to an auction', async t => {
  const repository = fromRoot('backend/services/product-service/src/features/auctions/auctionRepository');
  const service = fromRoot('backend/services/product-service/src/features/auctions/auctionService');
  const activity = fromRoot('backend/services/product-service/src/services/sellerActivityClient');
  const round = { id: 'r1', categories: [], submissionStartsAt: new Date(Date.now()-60000),
    submissionEndsAt: new Date(Date.now()+60000), auctionStartsAt: new Date(Date.now()+120000),
    auctionEndsAt: new Date(Date.now()+240000), maxItems: null };
  t.mock.method(repository, 'findRoundForSubmission', async () => round);
  t.mock.method(repository, 'withRoundMutationLock', async (_id, fn) => fn({}));
  t.mock.method(repository, 'findProductOwner', async () => ({ id: 'p1', sellerId: 's1',
    status: 'available', category: 'Clothes', moderatedAt: null }));
  t.mock.method(repository, 'findActiveAuctionByProductId', async () => null);
  t.mock.method(repository, 'setProductStatus', async () => {});
  t.mock.method(repository, 'create', async data => ({ id: 'a1', ...data }));
  t.mock.method(activity, 'recordActivity', () => {});
  const result = await service.submit({ user: { id: 's1', role: 'SELLER',
    kycVerified: false, kycStatus: 'EXPIRED' }, input: { productId: 'p1',
    roundId: 'r1', startingPrice: 100, bidIncrement: 10 } });
  assert.equal(result.status, 'pending_approval');
  console.log('R5: EXPIRED seller -> existing-product submission PENDING_APPROVAL');
});

// Reuse only the repository's in-memory test fixture, without registering its tests.
function checkoutFixture() {
  const filename = path.join(root, 'backend/services/order-service/src/features/checkoutSessions/checkoutSessionService.test.js');
  const source = fs.readFileSync(filename, 'utf8').split('\ntest(')[0];
  const fixtureModule = new Module(filename, module);
  fixtureModule.filename = filename;
  fixtureModule.paths = Module._nodeModulePaths(path.dirname(filename));
  fixtureModule._compile(source + '\nmodule.exports = { fixture, NOW };', filename);
  return fixtureModule.exports;
}

test('R6: checkout confirm accepts auction payment past the auction deadline', async t => {
  const { fixture, NOW } = checkoutFixture();
  const chat = fromRoot('backend/services/order-service/src/services/chatClient');
  t.mock.method(chat, 'notifyOrderPaid', async () => {});
  const f = fixture();
  f.state.orders = f.state.orders.filter(o => o.orderType === 'AUCTION');
  f.state.orders[0].paymentDeadlineAt = new Date(NOW.getTime()-1000);
  await f.create({ orderIds: ['o2'] });
  const paid = await f.service.confirm({ buyerId: 'b1', sessionId: 'c1', now: NOW });
  assert.equal(paid.status, 'paid');
  assert.equal(paid.orders[0].status, 'paid');
  console.log('R6: expired auction order -> new checkout -> PAID via checkout confirm');
});

test('R7: expiring QR checkout relists an auction product before 24h deadline', async () => {
  const { fixture, NOW } = checkoutFixture();
  const f = fixture();
  f.state.orders = f.state.orders.filter(o => o.orderType === 'AUCTION');
  f.state.orders[0].paymentDeadlineAt = new Date(NOW.getTime()+24*3600000);
  await f.create({ orderIds: ['o2'] });
  await f.service.get({ buyerId: 'b1', sessionId: 'c1', now: new Date(NOW.getTime()+11*60000) });
  assert.equal(f.state.orders[0].status, 'cancelled');
  // Outbox encodes its target state in the order log; inspect queued request.
  assert.ok(f.state.syncJobs.length || f.state.logs.some(l => l.action === 'PRODUCT_SYNC_REQUESTED'));
  const logs = JSON.stringify(f.state.logs);
  assert.match(logs, /available/);
  console.log('R7: 10-minute auction checkout expiry queues SET_STATUS available');
});

test('R8: Thai ID submission accepts no document or provider proof', async t => {
  const prisma = fromRoot('backend/services/auth-service/src/models/prismaClient');
  const service = fromRoot('backend/services/auth-service/src/features/kyc/kycService');
  let saved;
  const tx = { $queryRaw: async () => [],
    user: { findUnique: async () => ({ id: 's1', role: 'SELLER' }) },
    sellerProfile: { findUnique: async () => null, upsert: async ({create}) => { saved = create; return create; } },
    userRole: { findMany: async () => [{ role: 'SELLER' }], upsert: async () => ({}) },
    roleCatalog: { upsert: async () => ({}) },
    kycApplication: { create: async ({data}) => ({ id: 'k1', ...data }) } };
  // Role catalog delegate name is looked up in the actual assignRole function.
  tx.roleDefinition = tx.roleCatalog;
  t.mock.method(prisma, '$transaction', async fn => fn(tx));
  const result = await service.submitKyc({ userId: 's1', shopName: 'audit shop',
    idCardNumber: '1234567890123', address: 'audit address', verifyMethod: 'thai_id' });
  assert.equal(result.kycStatus, 'PENDING');
  assert.equal(saved.kycStorageKey, 'THAI_ID_METHOD');
  console.log('R8: no document/provider proof -> KYC PENDING (not auto VERIFIED)');
});

test('R9: inactivity worker overwrites activity recorded after its initial scan', async t => {
  const prisma = fromRoot('backend/services/auth-service/src/models/prismaClient');
  const job = fromRoot('backend/services/auth-service/src/jobs/sellerInactivityJob');
  const row = { userId: 's1', kycStatus: 'VERIFIED', lastActiveAt: new Date() };
  const previousProfile = prisma.sellerProfile;
  prisma.sellerProfile = { findMany: async () => [{ userId: 's1' }], updateMany: async ({ where, data }) => {
    assert.deepEqual(where, { userId: { in: ['s1'] } });
    Object.assign(row, data);
    return { count: 1 };
  } };
  t.after(() => { prisma.sellerProfile = previousProfile; });
  await job.runInactivityCheck();
  assert.equal(row.kycStatus, 'INACTIVE_EXPIRED');
  console.log('R9: update has no activity/status CAS; newly active seller is expired');
});

test('R10: live session state does not replace stale KYC claims', async () => {
  const shared = require(path.join(root, 'backend/shared'));
  const previous = process.env.JWT_ACCESS_SECRET;
  process.env.JWT_ACCESS_SECRET = 'ci-test-audit-only-not-an-application-secret';
  try {
    const token = shared.signAccessToken({ sub: 's1', sid: 'session1', role: 'SELLER',
      roles: ['SELLER'], kycVerified: true, kycStatus: 'VERIFIED' });
    const req = { headers: { authorization: `Bearer ${token}` }, app: { locals: {
      validateAccessSession: async () => ({ accountStatus: 'ACTIVE', commerceRestrictions: [],
        kycVerified: false, kycStatus: 'EXPIRED' }) } } };
    let accepted = false;
    await shared.requireAuth(req, { status: () => { throw Error('unexpected rejection'); } }, () => { accepted = true; });
    assert.equal(accepted, true);
    assert.equal(req.kycVerified, true);
    assert.equal(req.kycStatus, 'VERIFIED');
    console.log('R10: KYC still VERIFIED from JWT despite current EXPIRED session data');
  } finally {
    if (previous === undefined) delete process.env.JWT_ACCESS_SECRET;
    else process.env.JWT_ACCESS_SECRET = previous;
  }
});

test.after(() => mock.restoreAll());
