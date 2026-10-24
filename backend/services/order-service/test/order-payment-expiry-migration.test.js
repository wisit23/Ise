const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

test("forward order migration is replay-safe and does not infer historical cancellation causes", (t) => {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  db.exec(`
    CREATE TABLE orders (order_id TEXT PRIMARY KEY, status TEXT, pre_dispute_status TEXT, version INTEGER, updated_at TEXT);
    CREATE TABLE basket (status TEXT);
    CREATE TABLE product (status TEXT);
    CREATE TABLE checkouts (status TEXT);
    CREATE TABLE shipping (status TEXT);
    CREATE TABLE payment (payment_status TEXT);
    CREATE TABLE order_log (detail TEXT);
    INSERT INTO orders VALUES
      ('unpaid', 'inbasket', NULL, 1, '2026-01-01'),
      ('held', 'disputed', 'inbasket', 2, '2026-01-01'),
      ('cancelled', 'cancelled', NULL, 3, '2026-01-01'),
      ('current', 'pending_payment', NULL, 4, '2026-01-01'),
      ('expired', 'payment_expired', NULL, 5, '2026-01-01'),
      ('seller-timeout', 'seller_confirmation_expired', NULL, 6, '2026-01-01');
    INSERT INTO basket VALUES ('locked');
    INSERT INTO product VALUES ('reserved');
    INSERT INTO checkouts VALUES ('pending');
    INSERT INTO shipping VALUES ('pending');
    INSERT INTO payment VALUES ('pending');
    INSERT INTO order_log VALUES ('{"from":"inbasket","to":"cancelled"}');
  `);
  const sql = fs.readFileSync(path.join(__dirname,
    "../prisma/migrations/20261024000000_order_payment_and_expiry_states/migration.sql"), "utf8");
  db.exec(sql);
  const rows = db.prepare("SELECT * FROM orders ORDER BY order_id").all();
  assert.equal(rows.find((r) => r.order_id === "unpaid").status, "pending_payment");
  assert.equal(rows.find((r) => r.order_id === "unpaid").version, 2);
  assert.equal(rows.find((r) => r.order_id === "held").pre_dispute_status, "pending_payment");
  assert.equal(rows.find((r) => r.order_id === "held").version, 3);
  assert.equal(rows.find((r) => r.order_id === "held").status, "disputed");
  for (const [id, status, version] of [
    ["cancelled", "cancelled", 3], ["current", "pending_payment", 4],
    ["expired", "payment_expired", 5], ["seller-timeout", "seller_confirmation_expired", 6],
  ]) {
    const row = rows.find((r) => r.order_id === id);
    assert.equal(row.status, status);
    assert.equal(row.version, version);
    assert.equal(row.updated_at, "2026-01-01");
  }
  for (const [table, status] of [["basket", "locked"], ["product", "reserved"], ["checkouts", "pending"], ["shipping", "pending"]])
    assert.equal(db.prepare(`SELECT status FROM ${table}`).get().status, status);
  assert.equal(db.prepare("SELECT payment_status FROM payment").get().payment_status, "pending");
  assert.equal(db.prepare("SELECT detail FROM order_log").get().detail, '{"from":"inbasket","to":"cancelled"}');
  db.exec(sql);
  assert.deepEqual(db.prepare("SELECT * FROM orders ORDER BY order_id").all(), rows);
});
