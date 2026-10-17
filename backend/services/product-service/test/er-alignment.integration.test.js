const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
process.env.JWT_ACCESS_SECRET ||= 'er-test-secret';
process.env.INTERNAL_SERVICE_TOKEN ||= 'er-test-internal';
const url = process.env.DATABASE_URL_PRODUCT || process.env.DATABASE_URL;
const parsedDatabaseUrl = url ? new URL(url) : null;
const approvedDatabase = parsedDatabaseUrl
  && ['127.0.0.1', 'localhost'].includes(parsedDatabaseUrl.hostname)
  && parsedDatabaseUrl.port === '55439'
  && /^\/(?:product_luna_er|product_full_luna_er)$/.test(parsedDatabaseUrl.pathname);
if (!approvedDatabase) {
  if (process.env.PRODUCT_ER_REHEARSAL === '1') throw new Error('Isolated Product rehearsal database on 127.0.0.1:55439 required');
  test('Product ER alignment requires its explicitly isolated rehearsal database', { skip: 'Set the guarded rehearsal URL; no application database is accessed' }, () => {});
} else {
const prisma = require('../src/models/prismaClient');
const app = require('../src/app');
const { signAccessToken, permissionsForRoles } = require('@reloop/shared');
app.locals.validateAccessSession = async () => {};
const token = (id, role) => signAccessToken({ sub: id, role, roles: [role], permissions: permissionsForRoles([role]), kycVerified: true });
const seller = token('er-seller', 'SELLER');
const marketing = token('er-marketing', 'MARKETING');
const buyer = token('er-buyer', 'BUYER');
const auth = (req, value) => req.set('Authorization', `Bearer ${value}`);
const internal = (req, key) => req.set({ 'x-internal-token': process.env.INTERNAL_SERVICE_TOKEN, ...(key ? { 'x-idempotency-key': key } : {}) });
const repository = require('../src/features/auctions/auctionRepository');
const auditRepository = require('../src/features/audit/marketingAuditRepository');
const campaignRepository = require('../src/features/campaigns/campaignRepository');
const orderClient = require('../src/features/reviews/services/orderClient');
// External Queue/Chat providers are adapters, not services under this test.
const queue = require('../src/jobs/auctionCloseQueue');
queue.cancelClose = async () => {};
const chat = require('../src/features/auctions/chatClient');
const notifications = [];
chat.notifyItemCancelled = async (input) => { notifications.push(input); return { warnings: [] }; };
chat.notifyRoundCancelled = async (input) => { notifications.push(input); return { warnings: [] }; };
const media = [0,1,2,3].map((n) => ({ url: `/uploads/er-${n}.jpg`, type: 'image' }));

test('approved Product ER through actual HTTP consumers and PostgreSQL', async (t) => {
  const products = [], rounds = [], campaigns = [], reviews = [], items = [];
  await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS er_test_audit_failure ON marketing_audit_logs');
  await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS er_test_fail_audit()');
  await prisma.condition.upsert({ where: { value: 'Good' }, update: {}, create: { value: 'Good', label: 'Good' } });
  t.after(async () => {
    await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS er_test_audit_failure ON marketing_audit_logs');
    await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS er_test_fail_audit()');
    await prisma.review.deleteMany({ where: { id: { in: reviews } } });
    await prisma.product.deleteMany({ where: { id: { in: products } } });
    await prisma.auctionRound.deleteMany({ where: { id: { in: rounds } } });
    await prisma.campaignAttribution.deleteMany({ where: { campaignId: { in: campaigns } } });
    await prisma.campaign.deleteMany({ where: { id: { in: campaigns } } });
    await prisma.marketingAuditLog.deleteMany({ where: { OR: [
      { entityId: { in: [...products, ...rounds, ...campaigns, ...items] } },
      { actorId: { in: ['er-marketing'] } },
    ] } });
    await prisma.$disconnect();
  });
  let productId;
  await t.test('M:N category create, filter secondary, edit, composite key and condition FK', async () => {
    const created = await auth(request(app).post('/'), seller).send({ title: 'ER categories', price: 100, category: 'ER Primary', categories: ['ER Primary','ER Secondary','ER Primary'], condition: 'Good', media });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    productId = created.body.id; products.push(productId);
    assert.equal(created.body.category, 'ER Primary');
    assert.deepEqual(created.body.categories, ['ER Primary','ER Secondary']);
    assert.equal(await prisma.productCategory.count({ where: { productId } }), 2);
    await prisma.countView.create({ data: { viewerId: 'er-viewer', productId, count: 1 } });
    await assert.rejects(prisma.countView.create({ data: { viewerId: 'er-viewer', productId, count: 1 } }), { code: 'P2002' });
    assert.equal(await prisma.countView.count({ where: { viewerId: 'er-viewer', productId } }), 1);
    const search = await request(app).get('/search').query({ category: 'ER Secondary' });
    assert.equal(search.status, 200);
    assert.ok(search.body.items.some((p) => p.id === productId));
    const category = await prisma.category.findUnique({ where: { name: 'ER Primary' } });
    await assert.rejects(prisma.productCategory.create({ data: { productId, categoryId: category.id } }), { code: 'P2002' });
    await assert.rejects(prisma.product.update({ where: { id: productId }, data: { condition: 'Unknown' } }), { code: 'P2003' });
    const patched = await auth(request(app).patch(`/${productId}`), seller).send({ categories: ['ER Changed','ER Secondary'] });
    assert.equal(patched.status, 200, JSON.stringify(patched.body));
    assert.equal(patched.body.category, 'ER Changed');
    assert.deepEqual(patched.body.categories, ['ER Changed','ER Secondary']);
    const legacyPatch = await auth(request(app).patch(`/${productId}`), seller).send({ category: 'ER Legacy' });
    assert.equal(legacyPatch.status, 200);
    assert.equal(legacyPatch.body.category, 'ER Legacy');
    assert.deepEqual(legacyPatch.body.categories, ['ER Legacy','ER Secondary']);
    const explicitPatch = await auth(request(app).patch(`/${productId}`), seller).send({ category: 'ER Legacy', categories: ['ER Legacy'] });
    assert.deepEqual(explicitPatch.body.categories, ['ER Legacy']);
    // Concurrent unlocked delete+insert of the same membership pair would hit the composite PK.
    const productModel = require('../src/models/productModel');
    const rewrite = () => productModel.update(productId, { category: 'ER Legacy', categories: ['ER Legacy', 'ER Secondary', 'ER Third'] });
    const rewritten = await Promise.all([rewrite(), rewrite()]);
    assert.ok(rewritten.every((p) => p.categories.join() === 'ER Legacy,ER Secondary,ER Third'));
    // Legacy primary swap replaces the old primary only; the other memberships stay.
    const swapped = await productModel.update(productId, { category: 'ER Secondary' });
    assert.deepEqual(swapped.categories, ['ER Secondary', 'ER Third']);
  });
  await t.test('moderation same-key concurrency, conflict, atomic audit rollback/retry and marketing isolation', async () => {
    const command = () => internal(request(app).post(`/internal/moderation/${productId}/remove`), 'er-moderation-key').send({ reason: 'Known reason' });
    const replies = await Promise.all([command(),command()]);
    assert.deepEqual(replies.map((r) => r.status), [200,200]);
    assert.deepEqual(replies[0].body, replies[1].body);
    const log = await prisma.marketingAuditLog.findUnique({ where: { idempotencyKey: 'er-moderation-key' } });
    assert.ok(log.metadata.payloadHash);
    assert.equal(log.previousState.status, 'available');
    assert.equal(log.newState.status, 'removed');
    const mismatch = await internal(request(app).post(`/internal/moderation/${productId}/remove`), 'er-moderation-key').send({ reason: 'Different reason' });
    assert.equal(mismatch.status, 409);
    const exposed = await auth(request(app).get('/marketing/audit-logs'), marketing);
    assert.equal(exposed.status, 200);
    assert.ok(exposed.body.items.every((l) => l.entityType !== 'PRODUCT_MODERATION'));
    const targeted = await auth(request(app).get('/marketing/audit-logs').query({ entityId: productId }), marketing);
    assert.equal(targeted.body.total, 0);
    assert.equal(await auditRepository.findById(log.id), null);
    assert.equal((await auth(request(app).get('/marketing/audit-logs'), buyer)).status, 403);
    await prisma.$executeRawUnsafe(`CREATE FUNCTION er_test_fail_audit() RETURNS trigger AS $$ BEGIN IF NEW.idempotency_key IN ('er-rollback-key','CAMPAIGN_END_BUDGET:er-rollback-camp') THEN RAISE EXCEPTION 'injected audit failure'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`);
    await prisma.$executeRawUnsafe('CREATE TRIGGER er_test_audit_failure BEFORE INSERT ON marketing_audit_logs FOR EACH ROW EXECUTE FUNCTION er_test_fail_audit()');
    const restore = () => internal(request(app).post(`/internal/moderation/${productId}/restore`), 'er-rollback-key').send({ reason: 'Cleared' });
    assert.equal((await restore()).status, 500);
    assert.ok((await prisma.product.findUnique({ where: { id: productId } })).moderatedAt);
    assert.equal(await prisma.marketingAuditLog.count({ where: { idempotencyKey: 'er-rollback-key' } }), 0);
    await prisma.$executeRawUnsafe('DROP TRIGGER er_test_audit_failure ON marketing_audit_logs');
    assert.equal((await restore()).status, 200);
    assert.equal((await prisma.product.findUnique({ where: { id: productId } })).moderatedAt, null);
  });
  await t.test('attribution threshold audit failure rolls back fact/status/vouchers; retry and exact decimal SUM', async () => {
    const id = 'er-rollback-camp'; campaigns.push(id);
    await prisma.campaign.create({ data: { id, code: 'ER_ROLLBACK', name: 'ER campaign', budget: 10, discountValue: 10, status: 'published', startsAt: new Date(Date.now()-60000), endsAt: new Date(Date.now()+3600000), createdById: 'er-marketing' } });
    await prisma.userVoucher.create({ data: { userId: 'er-buyer', campaignId: id } });
    await prisma.$executeRawUnsafe('CREATE TRIGGER er_test_audit_failure BEFORE INSERT ON marketing_audit_logs FOR EACH ROW EXECUTE FUNCTION er_test_fail_audit()');
    const event = { eventId: 'er-failure-event', orderId: 'er-failure-order', campaignId: id, grossAmount: '20.25', discountAmount: '10.25', netAmount: '10.00', completedAt: new Date().toISOString() };
    const ingest = () => internal(request(app).post('/internal/campaigns/events/order-completed')).send(event);
    assert.equal((await ingest()).status, 500);
    assert.equal(await prisma.campaignAttribution.count({ where: { campaignId: id } }), 0);
    assert.equal((await campaignRepository.findById(id)).status, 'published');
    assert.equal((await campaignRepository.findVoucher('er-buyer',id)).status, 'CLAIMED');
    await prisma.$executeRawUnsafe('DROP TRIGGER er_test_audit_failure ON marketing_audit_logs');
    const res = await ingest(); assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(Number((await campaignRepository.findById(id)).spentBudget), 10.25);
    assert.equal((await campaignRepository.findById(id)).status, 'ended');
    assert.equal((await campaignRepository.findVoucher('er-buyer',id)).status, 'EXPIRED');
    const ended = await prisma.marketingAuditLog.findUnique({ where: { idempotencyKey: 'CAMPAIGN_END_BUDGET:er-rollback-camp' } });
    assert.equal(ended.newState.status, 'ended');
    assert.equal(Number(ended.newState.spentBudget), 10.25);
    assert.equal((await ingest()).body.deduplicated, true);
    assert.equal(await prisma.campaignAttribution.count({ where: { campaignId: id } }), 1);
  });
  await t.test('auction metadata and cancellation are projected from atomic audit state, including concurrent retry', async () => {
    const now = Date.now();
    const create = await auth(request(app).post('/auctions/rounds'), marketing).send({ title: 'ER Round Title', categories: ['ER Legacy'], submissionStartsAt: new Date(now+60000).toISOString(), submissionEndsAt: new Date(now+120000).toISOString(), auctionStartsAt: new Date(now+180000).toISOString(), auctionEndsAt: new Date(now+3600000).toISOString() });
    assert.equal(create.status, 201, JSON.stringify(create.body));
    const roundId = create.body.id; rounds.push(roundId);
    const item = await repository.create({ productId, sellerId: 'er-seller', roundId, status: 'scheduled', startingPrice: 100, bidIncrement: 10, scheduledStartAt: new Date(now+180000), scheduledEndAt: new Date(now+3600000) });
    items.push(item.id);
    const cancelItem = () => auth(request(app).patch(`/auctions/${item.id}/cancel`), marketing).send({ cancellationReason: 'Original item cancellation' });
    assert.equal((await cancelItem()).status, 200);
    const itemRetry = await cancelItem(); assert.equal(itemRetry.status, 200);
    assert.equal(itemRetry.body.cancellationReason, 'Original item cancellation');
    assert.equal(notifications.at(-1).reason, 'Original item cancellation');
    const roundCancel = () => auth(request(app).patch(`/auctions/rounds/${roundId}/cancel`), marketing).send({ reason: 'Original round cancellation' });
    const results = await Promise.all([roundCancel(),roundCancel()]);
    assert.deepEqual(results.map((r) => r.status), [200,200]);
    assert.ok(results.every((r) => r.body.title === 'ER Round Title' && r.body.cancelledBy === 'er-marketing'));
    const details = await request(app).get(`/auctions/rounds/${roundId}`);
    assert.equal(details.body.cancellationReason, 'Original round cancellation');
    assert.equal(notifications.at(-1).round.cancellationReason, 'Original round cancellation');
    assert.deepEqual(details.body.categories, ['ER Legacy']);
    const current = await request(app).get('/auctions/rounds/current');
    assert.ok(current.body.activeSubmissionRounds.every((r) => r.id !== roundId));
    const browse = await request(app).get('/auctions/rounds/browse');
    assert.ok(browse.body.upcomingRounds.some((r) => r.id === roundId && r.phase === 'cancelled'));
    const itemDetails = await request(app).get(`/auctions/${item.id}`);
    assert.equal(itemDetails.body.cancellationReason, 'Original item cancellation');
    // Internal ER state rows exist, but Marketing's audit read API neither lists, counts nor fetches them.
    const internalRows = await prisma.marketingAuditLog.findMany({ where: { action: { in: ['ER_STATE_IMPORT', 'ER_STATE_SNAPSHOT'] }, entityId: { in: [roundId, item.id] } } });
    assert.ok(internalRows.length >= 2);
    const visibleTotal = await prisma.marketingAuditLog.count({ where: { entityType: { not: 'PRODUCT_MODERATION' }, action: { notIn: ['ER_STATE_IMPORT', 'ER_STATE_SNAPSHOT'] } } });
    const listed = await auth(request(app).get('/marketing/audit-logs').query({ limit: 100 }), marketing);
    assert.equal(listed.body.total, visibleTotal);
    assert.ok(listed.body.items.every((l) => !['ER_STATE_IMPORT', 'ER_STATE_SNAPSHOT'].includes(l.action)));
    const forRound = await auth(request(app).get('/marketing/audit-logs').query({ entityId: roundId }), marketing);
    assert.ok(forRound.body.items.every((l) => l.action !== 'ER_STATE_SNAPSHOT'));
    assert.equal((await auth(request(app).get('/marketing/audit-logs').query({ action: 'ER_STATE_SNAPSHOT' }), marketing)).status, 400);
    assert.equal((await auditRepository.listAuditLogs({ action: 'ER_STATE_SNAPSHOT' })).total, 0);
    assert.equal(await auditRepository.findById(internalRows[0].id), null);
  });
  await t.test('review POST/read preserves ordered image/video media (Order provider stub)', async () => {
    const original = orderClient.getOrder;
    orderClient.getOrder = async () => ({ buyerId: 'er-buyer', sellerId: 'er-seller', productId, status: 'completed' });
    try {
      const media = [{ url: '/review-uploads/er-a.jpg', type: 'image' }, { url: '/review-uploads/er-b.mp4', type: 'video' }];
      const result = await auth(request(app).post('/reviews'), buyer).send({ orderId: 'er-review-order', rating: 5, comment: 'Preserved', media });
      assert.equal(result.status, 201, JSON.stringify(result.body)); reviews.push(result.body.id);
      assert.deepEqual(result.body.media, media);
      const byOrder = await auth(request(app).get('/reviews/by-order/er-review-order'), buyer);
      assert.equal(byOrder.status, 200, JSON.stringify(byOrder.body));
      assert.deepEqual(byOrder.body.review.media, media);
      assert.deepEqual((await prisma.reviewMedia.findMany({ where: { reviewId: result.body.id }, orderBy: { position: 'asc' } })).map((m) => m.mediaType), ['IMAGE','VIDEO']);
    } finally { orderClient.getOrder = original; }
  });
});
}
