const test = require("node:test");
const assert = require("node:assert/strict");
const { validateRemoteSession } = require("./sessionValidation");

test("session validation checks Auth again after a successful request", async (t) => {
  const previous = process.env.INTERNAL_SERVICE_TOKEN;
  process.env.INTERNAL_SERVICE_TOKEN = "session-validation-test-only";
  t.after(() => {
    if (previous === undefined) delete process.env.INTERNAL_SERVICE_TOKEN;
    else process.env.INTERNAL_SERVICE_TOKEN = previous;
  });
  let calls = 0;
  t.mock.method(global, "fetch", async (_url, options) => {
    assert.equal(JSON.parse(options.body).accessToken, "signed-access-token");
    assert.equal(
      options.headers["x-internal-token"],
      process.env.INTERNAL_SERVICE_TOKEN,
    );
    assert.ok(options.signal);
    calls += 1;
    return calls === 1
      ? { ok: true, json: async () => ({ active: true }) }
      : {
          ok: false,
          status: 403,
          json: async () => ({ code: "ACCOUNT_SUSPENDED", error: "suspended" }),
        };
  });
  await validateRemoteSession({}, "signed-access-token");
  await assert.rejects(validateRemoteSession({}, "signed-access-token"), {
    status: 403,
    code: "ACCOUNT_SUSPENDED",
  });
  assert.equal(calls, 2);
});

test("network, timeout, invalid responses and missing configuration fail closed", async (t) => {
  const previous = process.env.INTERNAL_SERVICE_TOKEN;
  process.env.INTERNAL_SERVICE_TOKEN = "session-validation-test-only";
  t.after(() => {
    if (previous === undefined) delete process.env.INTERNAL_SERVICE_TOKEN;
    else process.env.INTERNAL_SERVICE_TOKEN = previous;
  });
  const responses = [
    () => {
      throw new Error("network unavailable");
    },
    () => {
      throw new DOMException("timeout", "TimeoutError");
    },
    () => ({ ok: true, json: async () => ({}) }),
    () => ({
      ok: false,
      status: 403,
      json: async () => ({ error: "wrong internal key" }),
    }),
    () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: "database down" }),
    }),
  ];
  const mock = t.mock.method(global, "fetch", async () => responses.shift()());
  for (let i = 0; i < 5; i += 1) {
    await assert.rejects(validateRemoteSession({}, "token"), {
      status: 503,
      code: "AUTH_UNAVAILABLE",
    });
  }
  delete process.env.INTERNAL_SERVICE_TOKEN;
  await assert.rejects(validateRemoteSession({}, "token"), {
    status: 503,
    code: "AUTH_UNAVAILABLE",
  });
  assert.equal(mock.mock.callCount(), 5);
});
