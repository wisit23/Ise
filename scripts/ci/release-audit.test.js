const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluate } = require("./release-audit.cjs");
const policy = require("./release-audit-policy.json");

function fixture() {
  return {
    audit: { auditReportVersion: 2, vulnerabilities: {
      sharp: { severity: "high", nodes: ["node_modules/sharp"],
        via: policy.sharp0345.advisories.map((url) => ({ name: "sharp", severity: "high", url })) },
    } },
    lock: { packages: { "node_modules/sharp": { version: "0.34.5" } } },
    approved: { sharp0345: { ...policy.sharp0345, enabled: true } },
  };
}

test("disabled exception preserves the blocking release audit", () => {
  const { audit, lock } = fixture();
  const disabled = { sharp0345: { ...policy.sharp0345, enabled: false } };
  assert.deepEqual(evaluate(audit, lock, disabled).blocked, ["sharp"]);
});

test("explicit policy accepts only the reviewed Sharp findings at version 0.34.5", () => {
  const { audit, lock, approved } = fixture();
  assert.deepEqual(evaluate(audit, lock, approved), { accepted: ["sharp"], blocked: [] });
  lock.packages["node_modules/sharp"].version = "0.34.4";
  assert.deepEqual(evaluate(audit, lock, approved).blocked, ["sharp"]);
});

test("new Sharp advisories, critical severity, and unrelated dependencies still block", () => {
  const { audit, lock, approved } = fixture();
  audit.vulnerabilities.sharp.via.push({ name: "sharp", severity: "high", url: "https://github.com/advisories/GHSA-new" });
  assert.deepEqual(evaluate(audit, lock, approved).blocked, ["sharp"]);
  audit.vulnerabilities.sharp.via.pop();
  audit.vulnerabilities.sharp.severity = "critical";
  audit.vulnerabilities.other = { severity: "high", via: [{ name: "other" }] };
  assert.deepEqual(evaluate(audit, lock, approved).blocked, ["sharp", "other"]);
});

test("only dependency-only Next findings inherit the Sharp exception", () => {
  const { audit, lock, approved } = fixture();
  audit.vulnerabilities.next = { severity: "high", via: ["sharp"] };
  assert.deepEqual(evaluate(audit, lock, approved).blocked, []);
  audit.vulnerabilities.next.severity = "critical";
  assert.deepEqual(evaluate(audit, lock, approved).blocked, ["next"]);
  audit.vulnerabilities.next.severity = "high";
  audit.vulnerabilities.next.via.push({ name: "next", severity: "high", url: "https://github.com/advisories/GHSA-next" });
  assert.deepEqual(evaluate(audit, lock, approved).blocked, ["next"]);
});

test("network errors and malformed audit reports fail closed", () => {
  for (const report of [{}, { auditReportVersion: 2, error: { code: "NETWORK" }, vulnerabilities: {} }]) {
    assert.throws(() => evaluate(report, {}, policy), /complete npm audit/);
  }
});
