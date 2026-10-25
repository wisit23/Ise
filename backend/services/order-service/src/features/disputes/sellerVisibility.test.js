const test = require("node:test");
const assert = require("node:assert/strict");
const { isSellerVisible } = require("./sellerVisibility");

test("a new or merely claimed dispute does not involve the seller yet", () => {
  assert.equal(isSellerVisible(null), false);
  assert.equal(isSellerVisible({ status: "OPEN" }), false);
  assert.equal(isSellerVisible({ status: "OPEN", assignedTo: "agent", caseLog: [{ action: "CLAIM" }] }), false);
});

test("seller contact persists after reassignment and evidence submission", () => {
  for (const field of ["caseLog", "auditLog"]) {
    for (const action of ["SELLER_CONTACTED", "REQUEST_MORE_EVIDENCE"]) {
      assert.equal(isSellerVisible({ status: "OPEN", [field]: [{ action }, { action: "REASSIGN" }] }), true);
    }
  }
});

test("evidence requests and decisions are visible, deleted cases are hidden", () => {
  assert.equal(isSellerVisible({ status: "NEEDS_INFO" }), true);
  assert.equal(isSellerVisible({ status: "DECIDED" }), true);
  assert.equal(isSellerVisible({ decision: "REJECT" }), true);
  assert.equal(isSellerVisible({ status: "DECIDED", deletedAt: new Date() }), false);
});
