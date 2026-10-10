const test = require("node:test");
const assert = require("node:assert/strict");

const authClient = require("./authClient");

test("authClient applies a timeout signal to internal user lookups", async (t) => {
  authClient.setMockUserResolver(null);
  t.mock.method(global, "fetch", async (_url, options) => {
    assert.ok(options.signal instanceof AbortSignal);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        id: "agent-1",
        status: "ACTIVE",
        roles: ["CUSTOMER_SERVICE"],
      }),
    };
  });

  const user = await authClient.getUser("agent-1");
  assert.equal(user.id, "agent-1");
});
