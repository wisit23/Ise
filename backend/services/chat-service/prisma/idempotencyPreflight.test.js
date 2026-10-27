const test = require("node:test");
const assert = require("node:assert/strict");
const { preflight } = require("./idempotencyPreflight");

function database({ duplicateGroups = 0, missingKeys = 0 } = {}) {
  const commands = [];
  return {
    commands,
    async $runCommandRaw(command) {
      commands.push(command);
      if (command.aggregate) {
        return {
          cursor: { firstBatch: duplicateGroups ? [{ duplicateGroups }] : [] },
        };
      }
      if (command.count) return { n: missingKeys };
      return { ok: 1 };
    },
  };
}

test("duplicate keys block cutover with the aggregate count and no writes", async () => {
  const db = database({ duplicateGroups: 3, missingKeys: 2 });
  await assert.rejects(preflight(db, { apply: true }), (error) => {
    assert.match(error.message, /duplicate idempotency keys/);
    assert.deepEqual(error.summary, { missingKeys: 2, duplicateGroups: 3 });
    return true;
  });
  assert.equal(
    db.commands.some((command) => command.update),
    false,
  );
});

test("dry run reports missing keys without writing", async () => {
  const db = database({ missingKeys: 2 });
  assert.deepEqual(await preflight(db), {
    missingKeys: 2,
    duplicateGroups: 0,
    applied: false,
    readyForIndex: false,
  });
  assert.equal(db.commands.length, 2);
});

test("apply backfills only missing keys and allows the index", async () => {
  const db = database({ missingKeys: 2 });
  assert.equal((await preflight(db, { apply: true })).readyForIndex, true);
  assert.equal(db.commands[2].update, "Message");
  assert.deepEqual(db.commands[2].updates[0].q, {
    $or: [{ idempotencyKey: { $exists: false } }, { idempotencyKey: null }],
  });
});
