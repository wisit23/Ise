const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  validatePolicy,
  validateClientConfig,
  envInteger,
} = require("./customerServiceConfig");
const policy = require("../config/customer-service-policy.json");
const client = require("../config/customer-service-client.json");

test("configuration rejects unsafe scoring, unsupported clocks and contradictory deadlines", () => {
  for (const mutate of [
    (value) => {
      value.clock = "BUSINESS_HOURS";
    },
    (value) => {
      value.scoring.rankWeight = 1;
    },
    (value) => {
      value.scoring.amountDivisor = 0;
    },
    (value) => {
      value.evidenceResponseMinutes = 99999;
    },
    (value) => {
      value.classification.rules[0].pattern = "[";
    },
    (value) => {
      value.scoring.urgency.reverse();
    },
    (value) => {
      value.classification.rules[0].isDispute = "false";
    },
    (value) => {
      value.classification.rules[0].minimumAmout = 1000;
    },
    (value) => {
      value.priorities.LOW.rank = 10;
    },
  ]) {
    const copy = structuredClone(policy);
    mutate(copy);
    assert.throws(() => validatePolicy(copy));
  }
  const invalid = structuredClone(client);
  invalid.dashboard.timeZone = "Unknown/Zone";
  assert.throws(() => validateClientConfig(invalid));
});

test("invalid runtime environment values fail rather than silently falling back", () => {
  const name = "CS_TEST_INTEGER";
  const previous = process.env[name];
  try {
    for (const value of ["", "0", "-1", "1.5", "NaN"]) {
      process.env[name] = value;
      assert.throws(() => envInteger(name, 3));
    }
    delete process.env[name];
    assert.equal(envInteger(name, 3), 3);
  } finally {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  }
});

test("versioned external policy changes classification, scoring and evidence windows together", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cs-policy-"));
  const file = path.join(directory, "policy.json");
  const changed = structuredClone(policy);
  changed.classification.rules.find(
    (rule) => rule.code === "HIGH_VALUE_FINANCIAL_EXPOSURE",
  ).minimumAmount = 20000;
  changed.evidenceResponseMinutes = 1440;
  function run() {
    fs.writeFileSync(file, JSON.stringify(changed));
    return spawnSync(
      process.execPath,
      [
        "-e",
        `
      const { classifyCase, disputeDeadlines } = require('./backend/shared/src/servicePolicy');
      const { customerServicePolicy } = require('./backend/shared/src/customerServiceConfig');
      console.log(JSON.stringify({ assessment: classifyCase({ category:'PAYMENT', amount:10000 }),
        deadlines: disputeDeadlines('URGENT', new Date('2026-10-09T00:00:00Z')),
        evidence: customerServicePolicy.evidenceResponseMinutes }));
    `,
      ],
      {
        cwd: path.resolve(__dirname, "../../.."),
        env: { ...process.env, CS_POLICY_FILE: file },
        encoding: "utf8",
      },
    );
  }
  try {
    const unchangedVersion = run();
    assert.notEqual(unchangedVersion.status, 0);
    assert.match(unchangedVersion.stderr, /new version/);
    changed.version = "cs-test-v3";
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.assessment.priority, "HIGH");
    assert.equal(parsed.assessment.policyVersion, changed.version);
    assert.equal(parsed.evidence, changed.evidenceResponseMinutes);
    assert.equal(parsed.deadlines.slaPolicyVersion, changed.version);
  } finally {
    fs.unlinkSync(file);
    fs.rmdirSync(directory);
  }
});
