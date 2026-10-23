const test = require("node:test");
const assert = require("node:assert/strict");
const { loadEmailVerificationConfig } = require("./emailVerificationConfig");
const { ConfigError } = require("../../config/configReaders");

const MAIL_ON = {
  MAIL_TRANSPORT: "log",
  APP_BASE_URL: "http://localhost:3000",
  MAIL_FROM: "dev@localhost",
};

test("verification is required by default once mail can be sent", () => {
  const config = loadEmailVerificationConfig(MAIL_ON);
  assert.equal(config.required, true);
  assert.equal(config.tokenTtlHours, 24);
  assert.equal(config.appBaseUrl, "http://localhost:3000");
});

test("verification is off by default when mail is disabled", () => {
  assert.equal(loadEmailVerificationConfig({}).required, false);
});

test("it can be switched off explicitly even with mail configured", () => {
  const config = loadEmailVerificationConfig({ ...MAIL_ON, EMAIL_VERIFICATION: "off" });
  assert.equal(config.required, false);
});

for (const [label, env, pattern] of [
  ["required without any mail transport", { EMAIL_VERIFICATION: "required" }, /needs MAIL_TRANSPORT/],
  ["an unknown mode", { ...MAIL_ON, EMAIL_VERIFICATION: "maybe" }, /EMAIL_VERIFICATION/],
  ["a TTL out of range", { ...MAIL_ON, EMAIL_VERIFICATION_TOKEN_TTL_HOURS: "0" }, /TTL_HOURS/],
]) {
  test(`rejects ${label}`, () => {
    assert.throws(
      () => loadEmailVerificationConfig(env),
      (err) => {
        assert.ok(err instanceof ConfigError);
        assert.match(err.message, pattern);
        return true;
      },
    );
  });
}
