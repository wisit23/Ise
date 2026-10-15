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

test("T&S owns final decisions while CS only investigates and escalates", () => {
  const safety = { status: "OPEN", assignedRole: "TRUST_AND_SAFETY", assignedTo: "ts" };
  const caps = disputeCapabilities(safety, "ts", "TRUST_AND_SAFETY");
  assert.equal(caps.canDecide, true);
  assert.equal(caps.canRequestEvidence, true);
  assert.equal(caps.canReply, false);
  assert.equal(caps.canEscalate, false);
  assert.equal(disputeCapabilities(safety, "cs", "CUSTOMER_SERVICE").canViewDetail, false);
  const own = disputeCapabilities({ ...safety, assignedRole: "CUSTOMER_SERVICE", assignedTo: "cs" }, "cs", "CUSTOMER_SERVICE");
  assert.equal(own.canDecide, false);
  assert.equal(own.canEscalate, true);
  assert.equal(disputeCapabilities({ ...safety, status: "DECIDED" }, "ts", "TRUST_AND_SAFETY").canDecide, false);
});
