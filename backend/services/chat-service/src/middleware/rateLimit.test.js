const test = require("node:test");
const assert = require("node:assert/strict");

const { rateLimit } = require("./rateLimit");

/** A stand-in for the Lua-script call, so no Redis is needed here. */
function fakeRedis(evalImpl) {
  return { eval: evalImpl };
}

function fakeReqRes(userId) {
  const res = { headers: {}, setHeader: (k, v) => (res.headers[k] = v) };
  return [{ userId }, res];
}

/** Drives the middleware once and reports what it passed to next(). */
async function run(middleware, userId) {
  const [req, res] = fakeReqRes(userId);
  return new Promise((resolve) => {
    middleware(req, res, (err) => resolve({ err, res }));
  });
}

test("allows requests under the limit and rejects the one over it", async () => {
  let counter = 0;
  const limiter = rateLimit(
    "t",
    { limit: 3, windowSeconds: 60 },
    { client: fakeRedis(async () => ++counter) },
  );

  for (let i = 0; i < 3; i++) {
    const { err } = await run(limiter, "user-1");
    assert.equal(err, undefined, `request ${i + 1} should pass`);
  }

  const { err, res } = await run(limiter, "user-1");
  assert.equal(err.status, 429);
  // A client shouldn't have to guess how long to back off.
  assert.equal(res.headers["Retry-After"], 60);
});

test("counts per user, so one noisy account can't lock out everyone", async () => {
  const counts = new Map();
  const client = fakeRedis(async (_s, _n, key) => {
    const next = (counts.get(key) || 0) + 1;
    counts.set(key, next);
    return next;
  });

  const limiter = rateLimit("t", { limit: 1, windowSeconds: 60 }, { client });
  assert.equal((await run(limiter, "loud")).err, undefined);
  assert.equal((await run(limiter, "loud")).err.status, 429);
  // Different user, untouched budget.
  assert.equal((await run(limiter, "quiet")).err, undefined);
});

test("keys include the window, so the budget resets as time moves on", async () => {
  const seen = [];
  const client = fakeRedis(async (_s, _n, key) => {
    seen.push(key);
    return 1;
  });

  const limiter = rateLimit("t", { limit: 5, windowSeconds: 10 }, { client });
  await run(limiter, "user-1");
  const [name, , user, windowNow] = seen[0].split(":").slice(0);
  assert.equal(name, "ratelimit");
  assert.equal(user, "user-1");
  assert.equal(String(Number(windowNow)), windowNow, "window must be numeric");
});

test("fails OPEN when Redis is unreachable — chat must not go down with it", async () => {
  const client = fakeRedis(async () => {
    throw new Error("ECONNREFUSED");
  });

  const limiter = rateLimit("t", { limit: 1, windowSeconds: 60 }, { client });
  const { err } = await run(limiter, "user-1");
  assert.equal(err, undefined, "a Redis outage must not block sending");
});

test("an unauthenticated request has no key to count and is passed through", async () => {
  const client = fakeRedis(async () => {
    throw new Error("should not have been called");
  });

  const limiter = rateLimit("t", { limit: 1, windowSeconds: 60 }, { client });
  const { err } = await run(limiter, undefined);
  assert.equal(err, undefined);
});
