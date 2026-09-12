const test = require("node:test");
const assert = require("node:assert/strict");

const authClient = require("./authClient");

function stubFetch(t, impl) {
  const original = global.fetch;
  global.fetch = impl;
  t.after(() => {
    global.fetch = original;
  });
}

test("maps the internal API's response into a userId -> name Map", async (t) => {
  stubFetch(
    t,
    async () =>
      new Response(
        JSON.stringify([
          { userId: "u1", displayName: "สมชาย" },
          { userId: "u2", displayName: "ร้านทดสอบ" },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
  );

  const names = await authClient.getDisplayNames(["u1", "u2"]);
  assert.equal(names.get("u1"), "สมชาย");
  assert.equal(names.get("u2"), "ร้านทดสอบ");
});

test("sends the internal token and de-duplicates ids", async (t) => {
  let seen = null;
  stubFetch(t, async (url, init) => {
    seen = { url, init };
    return new Response("[]", { status: 200 });
  });

  await authClient.getDisplayNames(["u1", "u1", "u2", null]);
  assert.match(seen.url, /\/internal\/users\/display-names$/);
  assert.ok(seen.init.headers["x-internal-token"] !== undefined);
  assert.deepEqual(JSON.parse(seen.init.body).userIds, ["u1", "u2"]);
});

test("an auth-service outage degrades to an empty Map instead of throwing", async (t) => {
  stubFetch(t, async () => {
    throw new Error("ECONNREFUSED");
  });

  const names = await authClient.getDisplayNames(["u1"]);
  assert.equal(names.size, 0);
});

test("a non-2xx response degrades the same way", async (t) => {
  stubFetch(t, async () => new Response("nope", { status: 500 }));
  const names = await authClient.getDisplayNames(["u1"]);
  assert.equal(names.size, 0);
});

test("an empty id list makes no request at all", async (t) => {
  stubFetch(t, async () => {
    throw new Error("should not have been called");
  });
  const names = await authClient.getDisplayNames([]);
  assert.equal(names.size, 0);
});
