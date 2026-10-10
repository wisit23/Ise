const { test } = require("node:test");
const assert = require("node:assert/strict");
const { ticketCapabilities } = require("./workspacePolicy");
test("CS claims before reply; other owner and closed never writable", () => {
  const base = { status: "IN_PROGRESS", assigneeId: null };
  assert.equal(
    ticketCapabilities(base, "cs", "CUSTOMER_SERVICE").canReply,
    false,
  );
  assert.equal(
    ticketCapabilities({ ...base, assigneeId: "cs" }, "cs", "CUSTOMER_SERVICE")
      .canReply,
    true,
  );
  assert.equal(
    ticketCapabilities(
      { ...base, assigneeId: "other" },
      "cs",
      "CUSTOMER_SERVICE",
    ).canViewDetail,
    false,
  );
  assert.equal(
    ticketCapabilities(
      { ...base, status: "CLOSED", assigneeId: "cs" },
      "cs",
      "CUSTOMER_SERVICE",
    ).canClaim,
    false,
  );
  assert.equal(
    ticketCapabilities(
      { ...base, status: "ESCALATED" },
      "cs",
      "CUSTOMER_SERVICE",
    ).canViewDetail,
    false,
  );
});
test("Admin has audit and status powers without customer reply", () => {
  const caps = ticketCapabilities(
    { status: "IN_PROGRESS", assigneeId: "admin" },
    "admin",
    "ADMIN",
  );
  assert.equal(caps.canReply, false);
  assert.equal(caps.canAddNote, true);
  assert.ok(caps.allowedNextStatuses.includes("PENDING_USER"));
});
