const test = require("node:test");
const assert = require("node:assert/strict");
const { serializableTransaction } = require("./serializableTransaction");

test("serialization retries are bounded and unrelated failures are never retried", async () => {
  let calls = 0;
  const client = {
    $transaction: async () => {
      calls++;
      throw Object.assign(new Error("serialization conflict"), {
        code: "P2034",
      });
    },
  };
  await assert.rejects(
    serializableTransaction(client, () => {}, { attempts: 2 }),
    /conflict/,
  );
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(
    serializableTransaction(client, () => {}, { retryCodes: ["P2002"] }),
    /conflict/,
  );
  assert.equal(calls, 1);
});

test("successful retry returns the committed result and always uses serializable isolation", async () => {
  let calls = 0;
  const client = {
    $transaction: async (work, options) => {
      assert.equal(options.isolationLevel, "Serializable");
      if (++calls === 1)
        throw Object.assign(new Error("conflict"), { code: "P2034" });
      return work("transaction");
    },
  };
  assert.equal(
    await serializableTransaction(client, (tx) => `${tx}:result`),
    "transaction:result",
  );
  assert.equal(calls, 2);
});
