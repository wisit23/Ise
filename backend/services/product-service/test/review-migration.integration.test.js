const test = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('../src/generated/prisma-client');
const { migrateReviews } = require('../migrateReviewsFromReviewDb');

// Same isolation rule as er-alignment: only the disposable rehearsal server.
const url = process.env.DATABASE_URL_PRODUCT || process.env.DATABASE_URL;
const parsed = url ? new URL(url) : null;
const approved = parsed && ['127.0.0.1', 'localhost'].includes(parsed.hostname)
  && parsed.port === '55439' && /^\/(?:product_luna_er|product_full_luna_er)$/.test(parsed.pathname);

if (!approved) {
  test('review migration needs the isolated rehearsal database', { skip: 'Set the guarded rehearsal URL; no application database is accessed' }, () => {});
} else {
  test('legacy Review DB (photos/videos tables) migrates into review_media idempotently', async (t) => {
    const legacyName = `review_legacy_fixture_${process.pid}`;
    const legacyUrl = new URL(url); legacyUrl.pathname = `/${legacyName}`;
    const target = new PrismaClient({ datasources: { db: { url } } });
    await target.$executeRawUnsafe(`CREATE DATABASE "${legacyName}"`);
    const source = new PrismaClient({ datasources: { db: { url: legacyUrl.href } } });
    const ids = ['er-mig-review-1', 'er-mig-review-2'];
    t.after(async () => {
      await target.review.deleteMany({ where: { id: { in: ids } } });
      await source.$disconnect();
      await target.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${legacyName}"`);
      await target.$disconnect();
    });
    for (const ddl of [
      `CREATE TABLE reviews (id TEXT PRIMARY KEY, order_id TEXT UNIQUE NOT NULL, buyer_id TEXT NOT NULL, seller_id TEXT NOT NULL, product_id TEXT, rating INT NOT NULL, comment TEXT NOT NULL DEFAULT '', created_at TIMESTAMP(3) NOT NULL DEFAULT now())`,
      `CREATE TABLE review_photos (id TEXT PRIMARY KEY, review_id TEXT NOT NULL REFERENCES reviews(id), url TEXT NOT NULL, position INT NOT NULL DEFAULT 0, created_at TIMESTAMP(3) NOT NULL DEFAULT now())`,
      `CREATE TABLE review_videos (id TEXT PRIMARY KEY, review_id TEXT NOT NULL REFERENCES reviews(id), url TEXT NOT NULL, position INT NOT NULL DEFAULT 0, created_at TIMESTAMP(3) NOT NULL DEFAULT now())`,
      `INSERT INTO reviews (id, order_id, buyer_id, seller_id, product_id, rating, comment) VALUES ('er-mig-review-1','er-mig-order-1','b','s',NULL,5,'with media'), ('er-mig-review-2','er-mig-order-2','b','s',NULL,3,'')`,
      // Same legacy id in both tables: the image:/video: prefixes must keep both rows.
      `INSERT INTO review_photos (id, review_id, url, position) VALUES ('same-id','er-mig-review-1','/review-uploads/a.jpg',0), ('p2','er-mig-review-1','/review-uploads/c.jpg',2)`,
      `INSERT INTO review_videos (id, review_id, url, position) VALUES ('same-id','er-mig-review-1','/review-uploads/b.mp4',1)`,
    ]) await source.$executeRawUnsafe(ddl);

    const first = await migrateReviews(source, target);
    assert.deepEqual(first, { sourceTotal: 2, migrated: 2, existingCount: 0 });
    const stored = await target.review.findUnique({ where: { orderId: 'er-mig-order-1' }, include: { mediaEntries: { orderBy: { position: 'asc' } } } });
    assert.deepEqual(stored.mediaEntries.map((m) => [m.id, m.mediaType, m.url, m.position]), [
      ['image:same-id', 'IMAGE', '/review-uploads/a.jpg', 0],
      ['video:same-id', 'VIDEO', '/review-uploads/b.mp4', 1],
      ['image:p2', 'IMAGE', '/review-uploads/c.jpg', 2],
    ]);
    assert.equal((await target.review.findUnique({ where: { orderId: 'er-mig-order-2' }, include: { mediaEntries: true } })).mediaEntries.length, 0);

    assert.deepEqual(await migrateReviews(source, target), { sourceTotal: 2, migrated: 0, existingCount: 2 });
    await source.$executeRawUnsafe(`UPDATE reviews SET comment='changed' WHERE id='er-mig-review-1'`);
    await assert.rejects(migrateReviews(source, target), /Conflicting review for order er-mig-order-1/);
    await source.$executeRawUnsafe(`UPDATE reviews SET comment='with media' WHERE id='er-mig-review-1'`);
    await source.$executeRawUnsafe(`UPDATE review_photos SET url='/changed.jpg' WHERE id='p2'`);
    await assert.rejects(migrateReviews(source, target), /Conflicting review for order er-mig-order-1/);
    await source.$executeRawUnsafe(`UPDATE review_photos SET url='/review-uploads/c.jpg' WHERE id='p2'`);
    await source.$executeRawUnsafe(`INSERT INTO review_photos (id, review_id, url, position) VALUES ('late','er-mig-review-2','/review-uploads/d.jpg',0)`);
    await assert.rejects(migrateReviews(source, target), /Conflicting review for order er-mig-order-2/);
  });
}
