const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");

test("auction updates cross replica boundaries without echoing twice", async () => {
  const modulePath = require.resolve("./auctionRealtime");
  delete require.cache[modulePath];
  const first = require(modulePath);
  delete require.cache[modulePath];
  const second = require(modulePath);
  const subscribers = [new EventEmitter(), new EventEmitter()];
  for (const subscriber of subscribers) {
    subscriber.subscribe = async () => {};
    subscriber.quit = async () => {};
  }
  const publisher = () => ({
    publish: async (channel, raw) => {
      for (const sub of subscribers) sub.emit("message", channel, raw);
    },
    quit: async () => {},
  });
  const closeFirst = await first.startRelay({
    publisher: publisher(),
    subscriber: subscribers[0],
  });
  const closeSecond = await second.startRelay({
    publisher: publisher(),
    subscriber: subscribers[1],
  });
  const output = [[], []];
  const responses = output.map((chunks) =>
    Object.assign(new EventEmitter(), {
      status() {},
      set() {},
      write(chunk) {
        chunks.push(chunk);
      },
      end() {
        this.emit("close");
      },
    }),
  );
  first.subscribe("auction", new EventEmitter(), responses[0]);
  second.subscribe("auction", new EventEmitter(), responses[1]);
  first.publish("auction", "bid.created");
  for (const chunks of output)
    assert.equal(
      chunks.filter((chunk) => chunk.includes("event: auction-update")).length,
      1,
    );
  first.closeSubscribers();
  second.closeSubscribers();
  await Promise.all([closeFirst(), closeSecond()]);
  assert.equal(subscribers[0].listenerCount("message"), 0);
  assert.equal(subscribers[1].listenerCount("message"), 0);
});
