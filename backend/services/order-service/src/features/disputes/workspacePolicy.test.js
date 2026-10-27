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

test("escalating CS keeps a read-only view while T&S reviews", () => {
  const escalated = { status: "OPEN", assignedRole: "TRUST_AND_SAFETY", assignedTo: "ts", escalatedBy: "cs" };
  const caps = disputeCapabilities(escalated, "cs", "CUSTOMER_SERVICE");
  assert.equal(caps.canViewDetail, true);
  assert.equal(caps.isWatching, true);
  assert.equal(caps.canReply, false);
  assert.equal(caps.canEscalate, false);
  assert.equal(caps.canReassign, false);
  assert.match(caps.readOnlyReason, /Trust & Safety/);
  assert.equal(disputeCapabilities(escalated, "other-cs", "CUSTOMER_SERVICE").canViewDetail, false);
  assert.equal(disputeCapabilities({ ...escalated, status: "DECIDED" }, "cs", "CUSTOMER_SERVICE").isWatching, false);
});

test("a dispute returned by T&S is flagged for the CS owner", () => {
  const returned = { status: "NEEDS_INFO", assignedRole: "CUSTOMER_SERVICE", assignedTo: "cs", escalatedBy: "cs", returnedAt: new Date() };
  const caps = disputeCapabilities(returned, "cs", "CUSTOMER_SERVICE");
  assert.equal(caps.isReturned, true);
  assert.equal(caps.canReply, true);
  assert.equal(caps.canEscalate, true);
  assert.equal(disputeCapabilities({ ...returned, returnedAt: null }, "cs", "CUSTOMER_SERVICE").isReturned, false);
});

test("completed history is read-only for the escalating CS and prior assignees only", () => {
  const row = { status: "DECIDED", assignedRole: "TRUST_AND_SAFETY", assignedTo: "ts", escalatedBy: "cs", auditLog: [{ toAssignedTo: "previous-cs" }] };
  for (const id of ["cs", "previous-cs"]) {
    const caps = disputeCapabilities(row, id, "CUSTOMER_SERVICE");
    assert.equal(caps.canViewDetail, true);
    assert.equal(caps.isHistoryViewer, true);
    for (const action of ["canReply", "canClaim", "canEscalate", "canReassign", "canDecide", "canRequestEvidence"]) assert.equal(caps[action], false, action);
  }
  assert.equal(disputeCapabilities(row, "stranger", "CUSTOMER_SERVICE").canViewDetail, false);
  assert.equal(disputeCapabilities({ ...row, assignedRole: null, assignedTo: null }, "stranger", "CUSTOMER_SERVICE").canViewDetail, false);
  assert.equal(disputeCapabilities({ ...row, status: "OPEN" }, "previous-cs", "CUSTOMER_SERVICE").canViewDetail, false);
});
