const test = require("node:test");
const assert = require("node:assert/strict");
const { getCaseAccess } = require("./caseAccessClient");

test("case access uses the owning service and fails closed on outage", async (t) => {
  const originalFetch = global.fetch;
  const originalToken = process.env.INTERNAL_SERVICE_TOKEN;
  t.after(() => {
    global.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.INTERNAL_SERVICE_TOKEN;
    else process.env.INTERNAL_SERVICE_TOKEN = originalToken;
  });
  process.env.INTERNAL_SERVICE_TOKEN = "service-secret";
  let requested;
  global.fetch = async (url, options) => {
    requested = { url, options };
    return { ok: true, json: async () => ({ allowed: true, writable: false }) };
  };
  const conversation = { contextType: "DISPUTE", contextId: "case-1" };
  assert.deepEqual(await getCaseAccess(conversation, "agent-1", "AGENT"), {
    allowed: true, writable: false,
  });
  assert.match(requested.url, /\/internal\/disputes\/case-1\/chat-access\/agent-1\?role=AGENT&channel=DISPUTE$/);
  assert.equal(requested.options.headers["x-internal-token"], "service-secret");

  global.fetch = async () => { throw new Error("owner unavailable"); };
  await assert.rejects(() => getCaseAccess(conversation, "agent-1", "AGENT"),
    (err) => err.status === 503);
});
