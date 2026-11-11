const test = require("node:test");
const assert = require("node:assert/strict");
const { createCorsOptions } = require("./corsOptions");

test("legacy deployments retain public CORS without credential cookies", () => {
  const options = createCorsOptions({});
  assert.equal(options.origin, "*");
  assert.equal(options.credentials, undefined);
});

test("split frontend accepts only configured origins and allows affinity cookies", () => {
  const options = createCorsOptions({
    FRONTEND_ORIGINS: "https://app.example.com, https://staging.example.com",
  });
  assert.equal(options.credentials, true);
  for (const [origin, expected] of [
    ["https://app.example.com", true],
    ["https://other.example.com", false],
    [undefined, true],
  ]) {
    options.origin(origin, (error, allowed) => {
      assert.equal(error, null);
      assert.equal(allowed, expected);
    });
  }
});

test("origins must not contain paths, credentials or wildcard values", () => {
  for (const origin of [
    "*",
    "https://app.example.com/path",
    "https://user:pass@app.example.com",
    "ftp://app.example.com",
  ])
    assert.throws(() => createCorsOptions({ FRONTEND_ORIGINS: origin }));
});
