const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { getReports } = require("./metricsController");

test("invalid report query types fail before a database query", async () => {
  for (const query of [
    { targetId: ["a", "b"] },
    { targetId: {} },
    { targetId: " " },
    { limit: ["1"] },
    { limit: "1e2" },
    { limit: "1.5" },
    { limit: "0" },
    { search: ["shop", "other"] },
    { search: "x".repeat(101) },
    { page: ["1"] },
    { page: "0" },
    { page: "1.5" },
    { page: "9007199254740992" },
  ]) {
    let error;
    await getReports(
      { query },
      { json: () => assert.fail("unexpected success") },
      (err) => {
        error = err;
      },
    );
    assert.equal(error?.status, 400);
  }
});

test("report environment config accepts overrides and fails on invalid values", () => {
  const modulePath = require.resolve("./reportConfig");
  function check(overrides) {
    const env = { ...process.env };
    for (const key of [
      "EXECUTIVE_REPORT_DEFAULT_LIMIT",
      "EXECUTIVE_REPORT_MAX_LIMIT",
      "EXECUTIVE_REPORT_ANOMALY_THRESHOLD",
    ])
      delete env[key];
    return spawnSync(
      process.execPath,
      [
        "-e",
        `console.log(JSON.stringify(require(${JSON.stringify(modulePath)})))`,
      ],
      { env: { ...env, ...overrides }, encoding: "utf8" },
    );
  }
  const configured = check({
    EXECUTIVE_REPORT_DEFAULT_LIMIT: "10",
    EXECUTIVE_REPORT_MAX_LIMIT: "20",
    EXECUTIVE_REPORT_ANOMALY_THRESHOLD: "5",
  });
  assert.equal(configured.status, 0);
  assert.deepEqual(JSON.parse(configured.stdout), {
    DEFAULT_REPORT_LIMIT: 10,
    MAX_REPORT_LIMIT: 20,
    ANOMALY_THRESHOLD: 5,
  });
  for (const overrides of [
    { EXECUTIVE_REPORT_ANOMALY_THRESHOLD: "invalid" },
    { EXECUTIVE_REPORT_DEFAULT_LIMIT: "0" },
    { EXECUTIVE_REPORT_MAX_LIMIT: "1" },
  ]) {
    assert.notEqual(check(overrides).status, 0);
  }
});
