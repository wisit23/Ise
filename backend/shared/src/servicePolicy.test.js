const test = require("node:test");
const assert = require("node:assert/strict");
const {
  classifyCase,
  getServicePolicy,
  disputeDeadlines,
  disputeSla,
  SERVICE_POLICIES,
} = require("./servicePolicy");

test("classification covers practical intake scenarios and records reasons", () => {
  const scenarios = [
    [{ category: "OTHER", reason: "อยากสอบถามวิธีใช้" }, "LOW"],
    [{ category: "TECHNICAL", reason: "สีปุ่มเพี้ยน" }, "LOW"],
    [{ category: "TECHNICAL", reason: "โหลดรูปไม่ได้" }, "NORMAL"],
    [{ category: "ACCOUNT", reason: "เข้าสู่ระบบไม่ได้" }, "HIGH"],
    [{ category: "ORDER", reason: "ไม่ได้รับสินค้า" }, "HIGH"],
    [{ category: "PAYMENT", amount: 9999 }, "HIGH"],
    [{ category: "PAYMENT", amount: 10000 }, "URGENT"],
    [{ category: "PAYMENT", reason: "ชำระเงินซ้ำ" }, "URGENT"],
    [{ isDispute: true, amount: 500 }, "HIGH"],
    [{ isDispute: true, amount: 10000 }, "URGENT"],
    [{ reason: "สินค้าปลอม" }, "HIGH"],
    [{ category: "OTHER", reason: "สินค้านี้ไม่ใช่ของปลอม" }, "LOW"],
    [{ category: "OTHER", reason: "สินค้าไม่ใช่สินค้าปลอม" }, "LOW"],
    [{ reason: "account hacked" }, "URGENT"],
  ];
  for (const [input, expected] of scenarios) {
    const result = classifyCase(input);
    assert.equal(result.priority, expected, JSON.stringify(input));
    assert.ok(result.reasonCodes.length);
    assert.equal(result.policyVersion, "cs-24x7-v2");
  }
});

test("all policies allow review and the existing 48h evidence window before final decision", () => {
  for (const [priority, policy] of Object.entries(SERVICE_POLICIES)) {
    assert.ok(policy.resolutionMinutes > policy.firstResponseMinutes, priority);
    assert.ok(
      policy.disputeDecisionMinutes - policy.disputeReviewMinutes > 2880,
      priority,
    );
    assert.equal(getServicePolicy(priority).clock, "CALENDAR_24X7");
  }
});

test("dispute active SLA moves from first review to original decision deadline and legacy stays intact", () => {
  const start = new Date("2026-10-09T00:00:00Z");
  const deadlines = disputeDeadlines("HIGH", start);
  assert.equal(+deadlines.slaExpiresAt, +start + 2 * 3600000);
  assert.equal(+deadlines.decisionDueAt, +start + 7 * 86400000);
  assert.equal(
    disputeSla({ status: "OPEN", ...deadlines }).metric,
    "FIRST_REVIEW",
  );
  assert.equal(
    disputeSla({ status: "OPEN", ...deadlines, firstReviewedAt: start }).metric,
    "DECISION",
  );
  assert.equal(
    +disputeSla({ status: "OPEN", ...deadlines, firstReviewedAt: start }).dueAt,
    +deadlines.decisionDueAt,
  );
  assert.equal(
    disputeSla({ status: "DECIDED", ...deadlines }).state,
    "complete",
  );
  const legacy = disputeSla({ status: "OPEN", slaExpiresAt: start });
  assert.equal(+legacy.dueAt, +start);
  assert.equal(legacy.metric, null);
});
