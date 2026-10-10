const { test } = require("node:test");
const assert = require("node:assert/strict");
const { disputeCapabilities } = require("./workspacePolicy");
test("only assigned Admin decides; oversight chat stays read-only", () => {
  const base = { status: "OPEN", assignedRole: "ADMIN", assignedTo: "admin" };
  assert.equal(disputeCapabilities(base, "admin", "ADMIN").canDecide, true);
  assert.equal(disputeCapabilities(base, "admin", "ADMIN").canReply, false);
  assert.equal(
    disputeCapabilities(base, "cs", "CUSTOMER_SERVICE").canViewDetail,
    false,
  );
  assert.equal(
    disputeCapabilities(base, "ts", "TRUST_AND_SAFETY").canDecide,
    false,
  );
  assert.equal(
    disputeCapabilities({ ...base, status: "DECIDED" }, "admin", "ADMIN")
      .canDecide,
    false,
  );
});
test("unassigned requires claim; multiple roles preserve read-only", () => {
  const base = {
    status: "OPEN",
    assignedRole: "CUSTOMER_SERVICE",
    assignedTo: null,
  };
  assert.equal(
    disputeCapabilities(base, "cs", "CUSTOMER_SERVICE").canClaim,
    true,
  );
  assert.equal(
    disputeCapabilities(base, "cs", "CUSTOMER_SERVICE").canReply,
    false,
  );
  assert.equal(
    disputeCapabilities({ ...base, assignedTo: "cs" }, "cs", "CUSTOMER_SERVICE")
      .canReply,
    true,
  );
  assert.equal(
    disputeCapabilities(
      { ...base, assignedTo: "cs" },
      "cs",
      "CUSTOMER_SERVICE",
      ["ADMIN"],
    ).canReply,
    false,
  );
});
