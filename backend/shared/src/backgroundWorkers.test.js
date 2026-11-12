const test = require("node:test");
const assert = require("node:assert/strict");
const {
  backgroundWorkersEnabled,
  startBackgroundWorkers,
} = require("./backgroundWorkers");

test("existing deployments keep workers enabled, standby never starts its callback", () => {
  assert.equal(backgroundWorkersEnabled({}), true);
  let started = 0;
  startBackgroundWorkers(() => started++, {});
  startBackgroundWorkers(
    () => {
      throw new Error("standby started business jobs");
    },
    {
      BACKGROUND_WORKERS_ENABLED: "false",
    },
  );
  assert.equal(started, 1);
});

test("invalid worker mode fails before starting jobs", () => {
  for (const value of ["", "False", "0", "disabled"]) {
    assert.throws(
      () =>
        startBackgroundWorkers(() => assert.fail("started"), {
          BACKGROUND_WORKERS_ENABLED: value,
        }),
      /must be true or false/,
    );
  }
});
