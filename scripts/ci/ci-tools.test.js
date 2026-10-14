const test = require("node:test");
const assert = require("node:assert/strict");
const { GROUPS, discoverTests } = require("./service-tests.cjs");
const { validateTarget } = require("./prepare-databases.cjs");
test("every CI group finds tests; scoped runs cannot select another service", () => {
  for (const group of Object.keys(GROUPS)) {
    const all = discoverTests(group);
    assert.ok(all.length > 0);
    assert.ok(
      all.every((file) =>
        file.replaceAll("\\", "/").includes(`/${GROUPS[group]}/`),
      ),
    );
    assert.ok(
      discoverTests(group, { unit: true }).every(
        (file) => !/\.(integration|live)\.test\.js$/.test(file),
      ),
    );
  }
  assert.throws(() => discoverTests("../auth-service"), /Unknown test group/);
});
test("CI setup refuses application databases and remote targets before writing", () => {
  assert.equal(
    validateTarget(
      "postgresql://test:test@localhost:5432/reloop_ci_product?schema=public",
      "product",
    ).name,
    "reloop_ci_product",
  );
  for (const url of [
    "postgresql://test:test@localhost/reloop_product",
    "postgresql://test:test@remote.example/reloop_ci_auth",
    "postgresql://test:test@localhost/reloop_ci_auth?schema=auth",
    "postgresql://test:test@localhost/reloop_ci_bad%22name",
  ])
    assert.throws(() => validateTarget(url, "auth"), /Refusing/);
});
