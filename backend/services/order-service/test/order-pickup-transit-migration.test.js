const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

test("forward pickup/transit mapping preserves shipping facts, holds and audit history and is replay-safe", (t) => {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  db.exec(`
    CREATE TABLE orders (order_id TEXT PRIMARY KEY, status TEXT, pre_dispute_status TEXT, version INTEGER, shipped_at TEXT, updated_at TEXT);
    CREATE TABLE shipping (order_id TEXT, status TEXT, company TEXT, tracking_number TEXT, address_id TEXT);
    CREATE TABLE order_log (action TEXT, detail TEXT);
    CREATE TABLE hold (release_at TEXT);
    INSERT INTO orders VALUES
      ('legacy', 'shipped', NULL, 1, '2026-01-01', '2026-01-01'),
      ('held', 'disputed', 'shipped', 2, '2026-01-02', '2026-01-02'),
      ('both', 'shipped', 'shipped', 3, '2026-01-03', '2026-01-03'),
      ('pickup', 'pickup_in_progress', NULL, 4, NULL, '2026-01-04'),
      ('ready', 'ready_to_ship', NULL, 5, NULL, '2026-01-05'),
      ('transit', 'in_transit', NULL, 6, '2026-01-06', '2026-01-06'),
      ('done', 'completed', NULL, 7, '2026-01-07', '2026-01-07');
    INSERT INTO shipping VALUES
      ('legacy', 'shipped', 'Carrier', 'TRACK1', 'address1'),
      ('held', 'shipped', 'Carrier', 'TRACK2', 'address2'),
      ('pickup', 'pickup_in_progress', NULL, NULL, 'address3'),
      ('ready', 'pending', NULL, NULL, 'address4'),
      ('done', 'delivered', 'Carrier', 'TRACK3', 'address5');
    INSERT INTO order_log VALUES ('SHIPPED', '{"to":"shipped"}');
    INSERT INTO hold VALUES (NULL);
  `);
  const before = db.prepare("SELECT * FROM orders ORDER BY order_id").all();
  const shippingBefore = db.prepare("SELECT * FROM shipping ORDER BY order_id").all();
  const sql = fs.readFileSync(path.join(__dirname, "../prisma/migrations/20261025000000_compact_pickup_transit/migration.sql"), "utf8");
  db.exec(sql);
  const after = db.prepare("SELECT * FROM orders ORDER BY order_id").all();
  for (const row of after) {
    const old = before.find((r) => r.order_id === row.order_id);
    assert.equal(row.status, old.status === "shipped" ? "in_transit" : old.status);
    assert.equal(row.pre_dispute_status, old.pre_dispute_status === "shipped" ? "in_transit" : old.pre_dispute_status);
    assert.equal(row.shipped_at, old.shipped_at);
    assert.equal(row.version, old.version + (old.status === "shipped" || old.pre_dispute_status === "shipped" ? 1 : 0));
    if (row.version === old.version) assert.equal(row.updated_at, old.updated_at);
  }
  const shippingAfter = db.prepare("SELECT * FROM shipping ORDER BY order_id").all();
  assert.deepEqual(shippingAfter.map((row) => ({ ...row })), shippingBefore.map((row) => ({ ...row, status: row.status === "shipped" ? "in_transit" : row.status })));
  assert.deepEqual({ ...db.prepare("SELECT * FROM order_log").get() }, { action: "SHIPPED", detail: '{"to":"shipped"}' });
  assert.equal(db.prepare("SELECT release_at FROM hold").get().release_at, null);
  db.exec(sql);
  assert.deepEqual(db.prepare("SELECT * FROM orders ORDER BY order_id").all(), after);
  assert.deepEqual(db.prepare("SELECT * FROM shipping ORDER BY order_id").all(), shippingAfter);
});
