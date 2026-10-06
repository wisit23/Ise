const assert = require("node:assert/strict");
const { ID } = require("./demo-cs-admin");

const base = process.env.DEMO_GATEWAY_URL || "http://localhost:8080";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname)) {
  throw new Error("CS/Admin smoke only runs against a local gateway");
}

async function request(path, { token, method = "GET", body } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

async function login(email) {
  const response = await request("/api/auth/login", {
    method: "POST", body: { email, password: "password123" },
  });
  assert.equal(response.status, 200, `${email} login failed: ${JSON.stringify(response.data)}`);
  assert.ok(response.data.accessToken);
  return response.data.accessToken;
}

async function run() {
  const [admin, cs, otherCs, buyer] = await Promise.all([
    login("admin@example.com"), login("cs.nan@example.com"),
    login("cs.beam@example.com"), login("buyer.demo@example.com"),
  ]);
  const [ticketQueue, disputeQueue, reports] = await Promise.all([
    request("/api/support/tickets/queue?scope=all&limit=50", { token: admin }),
    request("/api/orders/disputes/queue?limit=50", { token: cs }),
    request("/api/auth/admin/reports?status=ALL&limit=50", { token: admin }),
  ]);
  assert.equal(ticketQueue.status, 200, "Admin ticket queue failed");
  assert.equal(disputeQueue.status, 200, "CS dispute queue failed");
  assert.equal(reports.status, 200, "Admin report queue failed");
  assert.ok(ID.tickets.every((id) => ticketQueue.data.items.some((row) => row.id === id)));
  assert.ok(ID.disputes.every((id) => disputeQueue.data.items.some((row) => row.id === id)));
  assert.ok(ID.reports.every((id) => reports.data.items.some((row) => row.id === id)));

  const adminJoin = await request(`/api/support/tickets/${ID.tickets[1]}/join`, {
    token: admin, method: "POST",
  });
  assert.equal(adminJoin.status, 200, "Admin could not join an existing ticket chat");
  const buyerJoin = await request(`/api/support/tickets/${ID.tickets[1]}/join`, {
    token: buyer, method: "POST",
  });
  assert.equal(buyerJoin.status, 200, "Buyer could not join own ticket chat");
  assert.equal(adminJoin.data.conversationId, buyerJoin.data.conversationId);
  const roomId = adminJoin.data.conversationId;
  const [adminHistory, buyerHistory] = await Promise.all([
    request(`/api/chat/conversations/${roomId}/messages?limit=30`, { token: admin }),
    request(`/api/chat/conversations/${roomId}/messages?limit=30`, { token: buyer }),
  ]);
  assert.equal(adminHistory.status, 200, "Admin history read failed");
  assert.equal(buyerHistory.status, 200, "Buyer history read failed");
  assert.ok(adminHistory.data.items.some((m) => m.visibility === "INTERNAL"));
  assert.ok(buyerHistory.data.items.every((m) => m.visibility !== "INTERNAL"));
  const escalatedJoin = await request(`/api/support/tickets/${ID.tickets[2]}/join`, {
    token: admin, method: "POST",
  });
  assert.equal(escalatedJoin.status, 200, "Admin could not open escalated ticket history");
  const escalatedHistory = await request(
    `/api/chat/conversations/${escalatedJoin.data.conversationId}/messages?limit=30`,
    { token: admin },
  );
  assert.equal(escalatedHistory.status, 200, "Admin could not read escalated ticket history");
  assert.ok(escalatedHistory.data.items.some((message) => message.body.includes("โอนเงินเพิ่ม")));

  const [csDisputeJoin, buyerDisputeJoin, decidedJoin] = await Promise.all([
    request(`/api/orders/disputes/${ID.disputes[1]}/conversation`, { token: cs, method: "POST" }),
    request(`/api/orders/disputes/${ID.disputes[1]}/conversation`, { token: buyer, method: "POST" }),
    request(`/api/orders/disputes/${ID.disputes[2]}/conversation`, { token: admin, method: "POST" }),
  ]);
  assert.equal(csDisputeJoin.status, 200, "Assigned CS could not open dispute chat");
  assert.equal(buyerDisputeJoin.status, 200, "Buyer could not open own dispute chat");
  assert.equal(csDisputeJoin.data.conversationId, buyerDisputeJoin.data.conversationId);
  assert.equal(decidedJoin.status, 200, "Admin could not open decided dispute history");
  assert.equal(decidedJoin.data.readOnly, true);
  const disputeHistory = await request(
    `/api/chat/conversations/${csDisputeJoin.data.conversationId}/messages?limit=30`,
    { token: cs },
  );
  assert.equal(disputeHistory.status, 200, "Assigned CS could not read dispute history");
  assert.ok(disputeHistory.data.items.some((message) => message.body.includes("สินค้าไม่ตรงภาพ")));
  assert.equal((await request(`/api/orders/disputes/${ID.disputes[1]}/conversation`, {
    token: otherCs, method: "POST",
  })).status, 403, "Unassigned CS should not enter another agent's dispute");
  console.log("CS/Admin API smoke passed: queues, ticket and dispute history, internal-note privacy, read-only decision and dispute access.");
}

if (require.main === module) run().catch((err) => {
  console.error(`[smoke:cs-admin] ${err.message}`);
  process.exitCode = 1;
});

module.exports = { run };
