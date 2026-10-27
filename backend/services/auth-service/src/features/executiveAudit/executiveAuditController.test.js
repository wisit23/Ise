const test = require("node:test");
const assert = require("node:assert/strict");
const { extractActor } = require("./executiveAuditController");

test("Executive audit uses the proxy-validated IP instead of the raw forwarded header", () => {
  const actor = extractActor({
    userId: "executive-1",
    userRole: "EXECUTIVE",
    ip: "192.0.2.1",
    headers: {
      "x-forwarded-for": "spoofed, 192.0.2.1",
      "user-agent": "test-agent",
    },
    socket: { remoteAddress: "127.0.0.1" },
  });
  assert.equal(actor.ipAddress, "192.0.2.1");
  assert.equal(actor.actorId, "executive-1");
  assert.equal(actor.userAgent, "test-agent");
  assert.equal(
    extractActor({ headers: {}, socket: { remoteAddress: "127.0.0.1" } })
      .ipAddress,
    "127.0.0.1",
  );
});
