const test = require("node:test");
const assert = require("node:assert/strict");

const disputeModel = require("./disputeModel");
const disputeService = require("./disputeService");
const orderModel = require("../../models/orderModel");
const authClient = require("../../services/authClient");

authClient.setMockUserResolver(async (id) => {
  if (id?.startsWith("multi-")) {
    return {
      id,
      status: "ACTIVE",
      roles: ["CUSTOMER_SERVICE", "TRUST_AND_SAFETY"],
      role: "CUSTOMER_SERVICE",
    };
  }
  if (id?.startsWith("ts-")) {
    return {
      id,
      status: "ACTIVE",
      roles: ["TRUST_AND_SAFETY"],
      role: "TRUST_AND_SAFETY",
    };
  }
  return {
    id,
    status: "ACTIVE",
    roles: ["CUSTOMER_SERVICE"],
    role: "CUSTOMER_SERVICE",
  };
});

orderModel.findById = async (id) => ({
  id,
  version: 1,
  status: "disputed",
});

test("disputeService.claim enforces role, unassigned check, and optimistic concurrency", async (t) => {
  const origFindById = disputeModel.findById;
  const origClaim = disputeModel.claim;

  t.after(() => {
    disputeModel.findById = origFindById;
    disputeModel.claim = origClaim;
  });

  // Non-agent
  await assert.rejects(
    () =>
      disputeService.claim({
        disputeId: "d1",
        userId: "u1",
        role: "BUYER",
        version: 1,
      }),
    (err) => err.status === 403,
  );

  // Already claimed
  disputeModel.findById = async () => ({
    id: "d1",
    status: "OPEN",
    assignedTo: "other-agent",
    version: 1,
  });
  await assert.rejects(
    () =>
      disputeService.claim({
        disputeId: "d1",
        userId: "u1",
        role: "CUSTOMER_SERVICE",
        version: 1,
      }),
    (err) => err.status === 409 && err.message.includes("already claimed"),
  );

  // Version mismatch
  disputeModel.findById = async () => ({
    id: "d1",
    status: "OPEN",
    assignedTo: null,
    version: 2,
  });
  await assert.rejects(
    () =>
      disputeService.claim({
        disputeId: "d1",
        userId: "u1",
        role: "CUSTOMER_SERVICE",
        version: 1,
      }),
    (err) => err.status === 409 && err.message.includes("modified"),
  );

  // Successful claim
  let claimCalledWith = null;
  disputeModel.claim = async (payload) => {
    claimCalledWith = payload;
    return {
      id: "d1",
      assignedTo: payload.userId,
      version: payload.version + 1,
    };
  };
  const result = await disputeService.claim({
    disputeId: "d1",
    userId: "agent-1",
    role: "CUSTOMER_SERVICE",
    version: 2,
  });
  assert.equal(result.assignedTo, "agent-1");
  assert.equal(claimCalledWith.userId, "agent-1");
  assert.equal(claimCalledWith.role, "CUSTOMER_SERVICE");

  // A staff role may be secondary to the legacy primary role.
  await disputeService.claim({
    disputeId: "d1",
    userId: "agent-multi-role",
    role: "BUYER",
    roles: ["BUYER", "CUSTOMER_SERVICE"],
    version: 2,
  });
  assert.equal(claimCalledWith.role, "CUSTOMER_SERVICE");
});

test("disputeService.reassign allows current assignee or Trust & Safety supervisor", async (t) => {
  const origFindById = disputeModel.findById;
  const origReassign = disputeModel.reassign;

  t.after(() => {
    disputeModel.findById = origFindById;
    disputeModel.reassign = origReassign;
  });

  disputeModel.findById = async () => ({
    id: "d1",
    status: "OPEN",
    assignedTo: "agent-1",
    assignedRole: "CUSTOMER_SERVICE",
    version: 1,
  });

  // Another CS agent cannot reassign
  await assert.rejects(
    () =>
      disputeService.reassign({
        disputeId: "d1",
        userId: "agent-2",
        role: "CUSTOMER_SERVICE",
        toUserId: "agent-3",
        reason: "take over",
        version: 1,
      }),
    (err) => err.status === 403,
  );

  // Trust & Safety supervisor can reassign even if not current assignee
  let reassignPayload = null;
  disputeModel.reassign = async (payload) => {
    reassignPayload = payload;
    return { id: "d1", assignedTo: payload.toUserId, version: 2 };
  };

  const tsResult = await disputeService.reassign({
    disputeId: "d1",
    userId: "ts-lead",
    role: "TRUST_AND_SAFETY",
    toUserId: "agent-3",
    reason: "supervisor reassignment",
    version: 1,
  });
  assert.equal(tsResult.assignedTo, "agent-3");
  assert.equal(reassignPayload.toUserId, "agent-3");
  assert.equal(reassignPayload.actorId, "ts-lead");

  const multiRoleResult = await disputeService.reassign({
    disputeId: "d1",
    userId: "ts-secondary",
    role: "CUSTOMER_SERVICE",
    roles: ["CUSTOMER_SERVICE", "TRUST_AND_SAFETY"],
    toUserId: "agent-3",
    reason: "multi-role supervisor reassignment",
    version: 1,
  });
  assert.equal(multiRoleResult.assignedTo, "agent-3");

  await disputeService.reassign({
    disputeId: "d1",
    userId: "ts-lead",
    role: "TRUST_AND_SAFETY",
    toUserId: "multi-target",
    reason: "keep a normal case in CS ownership",
    version: 1,
  });
  assert.equal(reassignPayload.toRole, "CUSTOMER_SERVICE");
});

test("disputeService.escalate transfers dispute to Trust & Safety", async (t) => {
  const origFindById = disputeModel.findById;
  const origEscalate = disputeModel.escalate;

  t.after(() => {
    disputeModel.findById = origFindById;
    disputeModel.escalate = origEscalate;
  });

  disputeModel.findById = async () => ({
    id: "d1",
    status: "OPEN",
    assignedTo: "cs-1",
    assignedRole: "CUSTOMER_SERVICE",
    version: 1,
  });

  let escalatePayload = null;
  disputeModel.escalate = async (payload) => {
    escalatePayload = payload;
    return { id: "d1", assignedRole: "TRUST_AND_SAFETY", version: 2 };
  };

  const res = await disputeService.escalate({
    disputeId: "d1",
    userId: "cs-1",
    role: "CUSTOMER_SERVICE",
    reason: "potential fraud detected",
    version: 1,
  });
  assert.equal(res.assignedRole, "TRUST_AND_SAFETY");
  assert.equal(escalatePayload.reason, "potential fraud detected");
  assert.equal(escalatePayload.actorId, "cs-1");
});

test("disputeService.decide and addEvidence enforce single ownership", async (t) => {
  const origFindById = disputeModel.findById;
  const origDecide = disputeModel.decide;

  t.after(() => {
    disputeModel.findById = origFindById;
    disputeModel.decide = origDecide;
  });

  disputeModel.findById = async () => ({
    id: "d1",
    status: "OPEN",
    assignedTo: "agent-owner",
    assignedRole: "CUSTOMER_SERVICE",
    version: 1,
    orderId: "o1",
  });

  // Non-assigned agent cannot decide
  await assert.rejects(
    () =>
      disputeService.decide({
        disputeId: "d1",
        userId: "agent-other",
        role: "CUSTOMER_SERVICE",
        decision: "REJECT",
        reason: "wrong agent",
        version: 1,
      }),
    (err) =>
      err.status === 403 && err.message.includes("only the assigned agent"),
  );

  // Non-assigned agent cannot add evidence
  await assert.rejects(
    () =>
      disputeService.addEvidence({
        disputeId: "d1",
        userId: "agent-other",
        role: "CUSTOMER_SERVICE",
        file: { filename: "ev.jpg", mimetype: "image/jpeg" },
      }),
    (err) =>
      err.status === 403 && err.message.includes("only the assigned agent"),
  );

  // Assigned agent can decide
  disputeModel.decide = async ({ decidedBy, decision, decisionReason }) => ({
    id: "d1",
    status: "DECIDED",
    decidedBy,
    decision,
    decisionReason,
    version: 2,
  });

  const decisionResult = await disputeService.decide({
    disputeId: "d1",
    userId: "agent-owner",
    role: "CUSTOMER_SERVICE",
    decision: "APPROVE_REFUND",
    reason: "valid proof",
    version: 1,
  });
  assert.equal(decisionResult.status, "DECIDED");
  assert.equal(decisionResult.decidedBy, "agent-owner");
});

test("disputeService requires numeric version on claim, reassign, escalate, and decide", async (t) => {
  const origFindById = disputeModel.findById;
  t.after(() => {
    disputeModel.findById = origFindById;
  });

  disputeModel.findById = async () => ({
    id: "d1",
    status: "OPEN",
    assignedTo: "agent-1",
    assignedRole: "CUSTOMER_SERVICE",
    version: 1,
  });

  // Missing or non-numeric version in claim
  await assert.rejects(
    () =>
      disputeService.claim({
        disputeId: "d1",
        userId: "agent-1",
        role: "CUSTOMER_SERVICE",
      }),
    (err) => err.status === 400 && err.message.includes("version is required"),
  );

  // Missing or non-numeric version in reassign
  await assert.rejects(
    () =>
      disputeService.reassign({
        disputeId: "d1",
        userId: "agent-1",
        role: "CUSTOMER_SERVICE",
        toUserId: "agent-2",
        reason: "reassign",
      }),
    (err) => err.status === 400 && err.message.includes("version is required"),
  );

  // Missing or non-numeric version in escalate
  await assert.rejects(
    () =>
      disputeService.escalate({
        disputeId: "d1",
        userId: "agent-1",
        role: "CUSTOMER_SERVICE",
        reason: "fraud",
      }),
    (err) => err.status === 400 && err.message.includes("version is required"),
  );

  // Missing or non-numeric version in decide
  await assert.rejects(
    () =>
      disputeService.decide({
        disputeId: "d1",
        userId: "agent-1",
        role: "CUSTOMER_SERVICE",
        decision: "APPROVE_REFUND",
        reason: "proof",
      }),
    (err) => err.status === 400 && err.message.includes("version is required"),
  );
});

test("disputeService prevents non-assignee from escalating and prevents CS from claiming/deciding escalated case", async (t) => {
  const origFindById = disputeModel.findById;
  t.after(() => {
    disputeModel.findById = origFindById;
  });

  // 1. Non-assignee CS cannot escalate
  disputeModel.findById = async () => ({
    id: "d1",
    status: "OPEN",
    assignedTo: "cs-owner",
    assignedRole: "CUSTOMER_SERVICE",
    version: 1,
  });

  await assert.rejects(
    () =>
      disputeService.escalate({
        disputeId: "d1",
        userId: "cs-other",
        role: "CUSTOMER_SERVICE",
        reason: "not mine",
        version: 1,
      }),
    (err) => err.status === 403,
  );

  // 2. Escalated dispute assignedRole is TRUST_AND_SAFETY, unassigned to specific agent
  disputeModel.findById = async () => ({
    id: "d1",
    status: "OPEN",
    assignedTo: null,
    assignedRole: "TRUST_AND_SAFETY",
    version: 2,
  });

  // CS agent cannot claim it
  await assert.rejects(
    () =>
      disputeService.claim({
        disputeId: "d1",
        userId: "cs-agent",
        role: "CUSTOMER_SERVICE",
        version: 2,
      }),
    (err) => err.status === 403 && err.message.includes("only Trust & Safety"),
  );

  // CS agent cannot decide it
  await assert.rejects(
    () =>
      disputeService.decide({
        disputeId: "d1",
        userId: "cs-agent",
        role: "CUSTOMER_SERVICE",
        decision: "REJECT",
        reason: "CS cannot decide escalated case",
        version: 2,
      }),
    (err) => err.status === 403 && err.message.includes("only Trust & Safety"),
  );

  // CS agent cannot add evidence to it
  await assert.rejects(
    () =>
      disputeService.addEvidence({
        disputeId: "d1",
        userId: "cs-agent",
        role: "CUSTOMER_SERVICE",
        file: { filename: "test.jpg", mimetype: "image/jpeg" },
      }),
    (err) => err.status === 403 && err.message.includes("only Trust & Safety"),
  );
});
