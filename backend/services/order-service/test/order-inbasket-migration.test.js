const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

// Rehearse the portable UPDATE against isolated rows, not a live service DB.
// This checks data mapping and scope; it is not a PostgreSQL deployment test.
test("inbasket migration renames only Order states and is safe to replay (SQLite rehearsal)", (t) => {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  db.exec(`
    CREATE TABLE orders (
      order_id TEXT PRIMARY KEY, status TEXT, pre_dispute_status TEXT,
      version INTEGER, updated_at TEXT
    );
    CREATE TABLE checkouts (status TEXT);
    CREATE TABLE shipping (status TEXT);
    CREATE TABLE payment (payment_status TEXT);
    CREATE TABLE order_log (detail TEXT);
    INSERT INTO orders VALUES
      ('cart', 'pending', NULL, 1, '2026-01-01'),
      ('awaiting-payment', 'pending_payment', NULL, 2, '2026-01-01'),
      ('paid', 'paid', NULL, 3, '2026-01-01'),
      ('held', 'disputed', 'pending', 4, '2026-01-01'),
      ('already-renamed', 'inbasket', NULL, 5, '2026-01-01');
    INSERT INTO checkouts VALUES ('pending');
    INSERT INTO shipping VALUES ('pending');
    INSERT INTO payment VALUES ('pending');
    INSERT INTO order_log VALUES ('{"from":"pending","to":"paid"}');
  `);
  const migration = fs.readFileSync(path.join(
    __dirname, "../prisma/migrations/20261023000000_order_pending_to_inbasket/migration.sql",
  ), "utf8");
  db.exec(migration);
  const rows = db.prepare("SELECT * FROM orders ORDER BY order_id").all();
  const cart = rows.find((row) => row.order_id === "cart");
  assert.equal(cart.status, "inbasket");
  assert.equal(cart.version, 2);
  assert.notEqual(cart.updated_at, "2026-01-01");
  const held = rows.find((row) => row.order_id === "held");
  assert.equal(held.status, "disputed");
  assert.equal(held.pre_dispute_status, "inbasket");
  assert.equal(held.version, 5);
  for (const [id, status, version] of [
    ["awaiting-payment", "pending_payment", 2],
    ["paid", "paid", 3],
    ["already-renamed", "inbasket", 5],
  ]) {
    const row = rows.find((order) => order.order_id === id);
    assert.equal(row.status, status);
    assert.equal(row.version, version);
    assert.equal(row.updated_at, "2026-01-01");
  }
  assert.equal(db.prepare("SELECT status FROM checkouts").get().status, "pending");
  assert.equal(db.prepare("SELECT status FROM shipping").get().status, "pending");
  assert.equal(db.prepare("SELECT payment_status FROM payment").get().payment_status, "pending");
  assert.equal(db.prepare("SELECT detail FROM order_log").get().detail, '{"from":"pending","to":"paid"}');
  db.exec(migration);
  assert.deepEqual(db.prepare("SELECT * FROM orders ORDER BY order_id").all(), rows);
});
