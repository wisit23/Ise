const test = require("node:test");
const assert = require("node:assert/strict");
const disputeModel = require("./disputeModel");
const disputeService = require("./disputeService");

const returned = {
  id: "case-1", status: "NEEDS_INFO", assignedRole: "CUSTOMER_SERVICE", assignedTo: "cs-1",
  returnedAt: new Date(), returnTasks: [{ id: "t1", text: "ขอวิดีโอ", done: false, note: "" }],
};

test("only the CS owner of a returned case updates its tasks", async (t) => {
  const findById = disputeModel.findById;
  const update = disputeModel.updateReturnTask;
  t.after(() => { disputeModel.findById = findById; disputeModel.updateReturnTask = update; });
  let dispute = returned;
  disputeModel.findById = async () => dispute;
  let call;
  disputeModel.updateReturnTask = async (args) => {
    call = args;
    return { ...dispute, returnTasks: [{ ...dispute.returnTasks[0], done: args.done, note: args.note }] };
  };
  const base = { disputeId: "case-1", taskId: "t1", role: "CUSTOMER_SERVICE" };
  const result = await disputeService.updateReturnTask({ ...base, userId: "cs-1", done: true, note: "  ได้แล้ว  " });
  assert.deepEqual(call, { id: "case-1", taskId: "t1", actorId: "cs-1", done: true, note: "ได้แล้ว" });
  assert.equal(result.returnTasks[0].done, true);
  await assert.rejects(disputeService.updateReturnTask({ ...base, userId: "cs-2", done: true }), { status: 403 });
  await assert.rejects(disputeService.updateReturnTask({ ...base, userId: "cs-1", done: "yes" }), { status: 400 });
  await assert.rejects(disputeService.updateReturnTask({ ...base, userId: "cs-1", note: "x".repeat(501) }), { status: 400 });
  dispute = { ...returned, returnedAt: null };
  await assert.rejects(disputeService.updateReturnTask({ ...base, userId: "cs-1", done: true }), { status: 403 });
});
