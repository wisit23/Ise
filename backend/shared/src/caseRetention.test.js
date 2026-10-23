const test = require("node:test");
const assert = require("node:assert/strict");
const { retentionView, retentionWhere } = require("./caseRetention");

test("normal queues exclude archived and deleted cases, with deleted history restricted to oversight", () => {
  assert.deepEqual(retentionWhere(), { deletedAt: null, archivedAt: null });
  assert.deepEqual(retentionWhere("archived"), {
    deletedAt: null,
    archivedAt: { not: null },
  });
  assert.equal(retentionView("archived", "CUSTOMER_SERVICE"), "archived");
  for (const view of ["all", "deleted"]) {
    assert.throws(() => retentionView(view, "CUSTOMER_SERVICE"), {
      status: 403,
    });
    assert.equal(retentionView(view, "TRUST_AND_SAFETY"), view);
    assert.equal(retentionView(view, "ADMIN"), view);
  }
  assert.throws(() => retentionView("anything", "ADMIN"), { status: 400 });
});
