/** End-to-end Admin financial verdict against local demo data; restores it afterward. */
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { ID } = require("./demo-cs-admin");

const base = process.env.DEMO_GATEWAY_URL || "http://localhost:8080";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname)) {
  throw new Error("Verdict smoke only runs against a local gateway");
}

async function call(url, { token, method = "GET", body } = {}) {
  const response = await fetch(`${base}${url}`, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}

async function login(email) {
  const result = await call("/api/auth/login", { method: "POST", body: { email, password: "password123" } });
  assert.equal(result.status, 200, `${email} login failed`);
  return result.data.accessToken;
}

async function run() {
  try {
    const [admin, cs, buyer] = await Promise.all([login("admin@example.com"), login("cs.nan@example.com"), login("buyer.demo@example.com")]);
    const id = ID.disputes[2];
    const initial = await call(`/api/orders/disputes/${id}`, { token: admin });
    assert.equal(initial.status, 200);
    assert.equal(initial.data.assignedRole, "ADMIN");
    const claimed = await call(`/api/orders/disputes/${id}/claim`, { token: admin, method: "POST", body: { version: initial.data.version } });
    assert.equal(claimed.status, 200);
    const payload = { decision: "RELEASE_ESCROW", reason: "หลักฐานยืนยันสินค้าตรงตามประกาศ", version: claimed.data.version, idempotencyKey: `demo-verdict-${id}-${claimed.data.version}` };
    const denied = await call(`/api/orders/disputes/${id}/decision`, { token: cs, method: "POST", body: payload });
    assert.equal(denied.status, 403, "CS must not decide money");
    const first = await call(`/api/orders/disputes/${id}/decision`, { token: admin, method: "POST", body: payload });
    assert.equal(first.status, 200);
    assert.equal(first.data.status, "DECIDED");
    assert.equal(first.data.chatLockError, undefined, "Both party notices and locks must succeed");
    const retry = await call(`/api/orders/disputes/${id}/decision`, { token: admin, method: "POST", body: payload });
    assert.equal(retry.status, 200, "same idempotency key must return the original verdict");
    const conflicting = await call(`/api/orders/disputes/${id}/decision`, { token: admin, method: "POST", body: { ...payload, idempotencyKey: `different-${id}` } });
    assert.equal(conflicting.status, 409);
    const order = await call(`/api/orders/${ID.orders[2]}`, { token: buyer });
    assert.equal(order.status, 200);
    assert.equal(order.data.status, "completed");
    assert.equal(order.data.payoutHeld, false);
    for (const side of ["buyer", "seller"]) {
      const transcript = await call(`/api/orders/disputes/${id}/audit-transcript?side=${side}`, { token: admin });
      assert.equal(transcript.status, 200);
      const notices = transcript.data.messages.filter((m) => m.body?.includes("ผลการตัดสิน: ปล่อยเงินให้ผู้ขาย"));
      assert.equal(notices.length, 1, `${side} must receive exactly one verdict notice`);
      assert.equal(transcript.data.conversation.status, "LOCKED");
    }
    console.log("Admin verdict smoke passed: CS denied, release applied once, both notices deduplicated, both rooms locked.");
  } finally {
    const restored = spawnSync(process.execPath, [path.join(__dirname, "demo-cs-admin.js"), "--apply"], { stdio: "inherit" });
    if (restored.status !== 0) throw new Error("Could not restore local CS/Admin demo data");
  }
}

if (require.main === module) run().catch((err) => {
  console.error(`[smoke:cs-admin-verdict] ${err.message}`);
  process.exitCode = 1;
});
