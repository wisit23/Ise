const test = require("node:test");
const assert = require("node:assert/strict");

// Queue-only tests never connect to Redis.
const jobs = new Map();
const added = [];
const removed = [];
class FakeRedis { async quit() {} }
class FakeQueue {
  async getJob(id) { return jobs.get(id); }
  async remove(id) { removed.push(id); jobs.delete(id); }
  async add(name, data, options) { added.push({ name, data, options }); }
  async close() {}
}
class FakeWorker {
  constructor(name, handler) { this.handler = handler; }
}
for (const [name, exports] of [["bullmq", { Queue: FakeQueue, Worker: FakeWorker }], ["ioredis", FakeRedis]]) {
  const id = require.resolve(name);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}
const queue = require("./auctionCloseQueue");

test("scheduling books both opening and closing without a page visit", async () => {
  const start = new Date(Date.now() + 60000);
  const end = new Date(+start + 60000);
  await queue.scheduleClose("item-1", end, start);
  assert.deepEqual(added.map((j) => j.name), ["open", "close"]);
  assert.equal(added[0].options.jobId, "open-item-1");
  assert.equal(added[1].options.jobId, "item-1");
  assert.ok(added[0].options.delay > 0);
  assert.ok(added[1].options.delay > added[0].options.delay);
});

test("rescheduling an active opening books the new time separately", async () => {
  jobs.set("open-item-2", { getState: async () => "active" });
  const start = new Date(Date.now() + 60000);
  await queue.scheduleClose("item-2", new Date(+start + 60000), start);
  assert.ok(added.some((j) => j.options.jobId === `open-item-2-${+start}`));
  assert.ok(!removed.includes("open-item-2"));
});

test("cancelling removes both boundary jobs", async () => {
  await queue.cancelClose("item-3");
  assert.ok(removed.includes("item-3"));
  assert.ok(removed.includes("open-item-3"));
});

test("opening and closing workers use the same service entry point", async () => {
  const calls = [];
  const worker = queue.startWorker(async (id) => calls.push(id));
  await worker.handler({ name: "open", data: { auctionId: "item-1" } });
  await worker.handler({ name: "close", data: { auctionId: "item-1" } });
  assert.deepEqual(calls, ["item-1", "item-1"]);
});
