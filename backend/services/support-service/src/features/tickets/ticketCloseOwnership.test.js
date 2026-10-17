const test = require("node:test");
const assert = require("node:assert/strict");
const model = require("./ticketModel");
const service = require("./ticketService");
const { ticketCapabilities } = require("./workspacePolicy");

for (const role of ["ADMIN", "TRUST_AND_SAFETY"]) {
  test(`${role} must claim/take over before closing, including direct API calls`, async (t) => {
    let ticket = { id: "t", status: "ESCALATED", assigneeId: null, version: 1 };
    let writes = 0;
    t.mock.method(model, "findById", async () => ticket);
    t.mock.method(model, "transitionStatus", async () => { writes++; ticket = { ...ticket, status: "CLOSED" }; return true; });
    for (const assigneeId of [null, "cs-1", "other-trust"]) {
      ticket = { ...ticket, assigneeId };
      const caps = ticketCapabilities(ticket, "me", role);
      assert.equal(caps.canClose, false);
      assert.equal(caps.canChangeStatus, false);
      assert.deepEqual(caps.allowedNextStatuses, []);
      await assert.rejects(service.changeStatus({ ticketId: "t", userId: "me", role, status: "CLOSED", version: 1 }), { status: 403 });
    }
    assert.equal(writes, 0);
    ticket = { ...ticket, assigneeId: "me" };
    assert.equal(ticketCapabilities(ticket, "me", role).canClose, true);
    await service.changeStatus({ ticketId: "t", userId: "me", role, status: "CLOSED", version: 1 });
    assert.equal(writes, 1);
  });
}
