const test = require("node:test");
const assert = require("node:assert/strict");
const { buildAuditEntry } = require("./executiveAuditPolicy");

const csvMonth = {
  action: "REPORT_EXPORT_CSV",
  targetId: "2026-10",
  metadata: { granularity: "month", year: 2026, monthIndex: 9, rowCount: 31 },
};

test("builds the entry from the allowed facts and writes the wording itself", () => {
  const entry = buildAuditEntry({
    ...csvMonth,
    category: "FINANCIAL",
    description: "ลบข้อมูลลูกค้าทั้งหมด",
  });

  assert.equal(entry.action, "REPORT_EXPORT_CSV");
  // The category and the description come from the server, not the caller.
  assert.equal(entry.category, "DATA_EXPORT");
  assert.equal(entry.targetType, "report");
  assert.equal(
    entry.description,
    "ส่งออกรายงานยอดขายและรายได้ (เดือน ตุลาคม 2569)",
  );
  assert.equal(entry.targetId, "2026-10");
  assert.deepEqual(entry.metadata, csvMonth.metadata);
});

test("describes a yearly export", () => {
  const entry = buildAuditEntry({
    action: "REPORT_EXPORT_CSV",
    metadata: { granularity: "year", year: 2026, rowCount: 12 },
  });
  assert.equal(entry.description, "ส่งออกรายงานยอดขายและรายได้ (ปี 2569)");
  assert.equal(entry.targetId, null);
});

test("rejects an action that is not on the list", () => {
  for (const action of [
    "DELETE_ALL_USERS",
    "",
    undefined,
    "__proto__",
    "toString",
  ]) {
    assert.throws(
      () => buildAuditEntry({ action }),
      (err) => err.status === 400,
      String(action),
    );
  }
  assert.throws(
    () => buildAuditEntry(null),
    (err) => err.status === 400,
  );
});

test("drops metadata keys that are not listed", () => {
  const entry = buildAuditEntry({
    ...csvMonth,
    metadata: { ...csvMonth.metadata, secret: "x".repeat(10000), note: {} },
  });
  assert.deepEqual(entry.metadata, csvMonth.metadata);
});

test("rejects metadata with a wrong type or out-of-range value", () => {
  const bad = [
    { granularity: "decade" },
    { year: "2026" },
    { year: 99999 },
    { monthIndex: 12 },
    { rowCount: -1 },
    { rowCount: 1.5 },
  ];
  for (const metadata of bad) {
    assert.throws(
      () => buildAuditEntry({ action: "REPORT_EXPORT_CSV", metadata }),
      (err) => err.status === 400,
      JSON.stringify(metadata),
    );
  }
});

test("rejects a target id that is not a short slug", () => {
  for (const targetId of ["../etc/passwd", "a b", "x".repeat(101), 5, {}]) {
    assert.throws(
      () => buildAuditEntry({ action: "REPORT_EXPORT_CSV", targetId }),
      (err) => err.status === 400,
      String(targetId),
    );
  }
});

test("still describes the export when the details are missing", () => {
  const entry = buildAuditEntry({ action: "REPORT_EXPORT_CSV" });
  assert.equal(entry.description, "ส่งออกรายงานยอดขายและรายได้");
  assert.equal(entry.metadata, null);
});
