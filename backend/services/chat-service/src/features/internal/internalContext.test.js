const test = require("node:test");
const assert = require("node:assert/strict");
const { contextKeyForInternalContextId } = require("./internalContext");

test("internal dispute context is deterministic and rejects missing ID", () => {
  assert.equal(contextKeyForInternalContextId("DISPUTE", "case-1"), "DISPUTE:case-1");
  assert.throws(() => contextKeyForInternalContextId("DISPUTE", ""),
    (err) => err.status === 400);
});
