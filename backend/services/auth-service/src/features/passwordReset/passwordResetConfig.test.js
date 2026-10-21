const test = require("node:test");
const assert = require("node:assert/strict");
const { loadPasswordResetConfig, ConfigError } = require("./passwordResetConfig");

const SMTP_ENV = {
  MAIL_TRANSPORT: "smtp",
  APP_BASE_URL: "https://re-loop.example/some/path",
  MAIL_FROM: "RE-LOOP <noreply@re-loop.example>",
  SMTP_HOST: "smtp.gmail.com",
  SMTP_USER: "noreply@re-loop.example",
  SMTP_PASS: "app-password",
};

test("with nothing configured the feature is off instead of half-working", () => {
  const config = loadPasswordResetConfig({});
  assert.equal(config.enabled, false);
  assert.equal(config.tokenTtlMinutes, 30);
});

test("a complete SMTP setup is accepted with STARTTLS on 587 by default", () => {
  const config = loadPasswordResetConfig(SMTP_ENV);
  assert.equal(config.enabled, true);
  assert.equal(config.appBaseUrl, "https://re-loop.example", "path is dropped; links are built from the origin");
  assert.deepEqual(config.mail.smtp, {
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: { user: "noreply@re-loop.example", pass: "app-password" },
  });
});

test("port 465 defaults to implicit TLS", () => {
  const config = loadPasswordResetConfig({ ...SMTP_ENV, SMTP_PORT: "465" });
  assert.equal(config.mail.smtp.secure, true);
});

for (const [label, env, pattern] of [
  ["unknown transport", { MAIL_TRANSPORT: "sendgrid" }, /MAIL_TRANSPORT/],
  ["missing base URL", { ...SMTP_ENV, APP_BASE_URL: "" }, /APP_BASE_URL is required/],
  ["relative base URL", { ...SMTP_ENV, APP_BASE_URL: "/reset" }, /absolute URL/],
  ["plain http on a public host", { ...SMTP_ENV, APP_BASE_URL: "http://re-loop.example" }, /https/],
  ["missing sender", { ...SMTP_ENV, MAIL_FROM: "" }, /MAIL_FROM/],
  ["missing SMTP host", { ...SMTP_ENV, SMTP_HOST: "" }, /SMTP_HOST/],
  ["user without password", { ...SMTP_ENV, SMTP_PASS: "" }, /set together/],
  ["bad port", { ...SMTP_ENV, SMTP_PORT: "abc" }, /SMTP_PORT/],
  ["bad TLS flag", { ...SMTP_ENV, SMTP_SECURE: "yes" }, /SMTP_SECURE/],
  ["TTL out of range", { ...SMTP_ENV, PASSWORD_RESET_TOKEN_TTL_MINUTES: "1" }, /TOKEN_TTL/],
  [
    "log transport on a real server",
    { MAIL_TRANSPORT: "log", APP_BASE_URL: "https://re-loop.example", MAIL_FROM: "a@b.co" },
    /only allowed when APP_BASE_URL is localhost/,
  ],
]) {
  test(`rejects ${label}`, () => {
    assert.throws(() => loadPasswordResetConfig(env), (err) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, pattern);
      return true;
    });
  });
}

test("the log transport is allowed for local development", () => {
  const config = loadPasswordResetConfig({
    MAIL_TRANSPORT: "log",
    APP_BASE_URL: "http://localhost:3000",
    MAIL_FROM: "dev@localhost",
  });
  assert.equal(config.enabled, true);
  assert.equal(config.appBaseUrl, "http://localhost:3000");
});
