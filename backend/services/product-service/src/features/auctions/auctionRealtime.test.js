const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const realtime = require("./auctionRealtime");

test("TC_AUC15 pushes an auction update to every connected detail session", () => {
  const requests = [new EventEmitter(), new EventEmitter()];
  const output = [[], []];
  const responses = output.map((chunks) => Object.assign(new EventEmitter(), {
    status() {
      return this;
    },
    set() {
      return this;
    },
    flushHeaders() {},
    write(chunk) {
      chunks.push(chunk);
      return true;
    },
  }));

  realtime.subscribe("auction-1", requests[0], responses[0]);
  realtime.subscribe("auction-1", requests[1], responses[1]);
  const delivered = realtime.publish("auction-1", "bid.created");

  assert.equal(delivered, 2);
  assert.match(output[0].join(""), /event: auction-update/);
  assert.match(output[0].join(""), /bid\.created/);
  assert.match(output[1].join(""), /event: auction-update/);

  responses.forEach((response) => response.emit("close"));
  assert.equal(realtime.publish("auction-1", "bid.created"), 0);
});
