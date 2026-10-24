// Settings for sign-up email verification.
//
// EMAIL_VERIFICATION:
//   required - new accounts must confirm their email before signing in
//   off      - sign-up signs the user straight in (no email is sent)
// Defaults to "required" whenever mail can be sent, "off" otherwise. Asking
// for "required" without a working MAIL_TRANSPORT is a startup error: nobody
// could ever finish signing up.
const { ConfigError, readInteger, readChoice } = require("../../config/configReaders");
const { loadMailConfig } = require("../../config/mailConfig");

function loadEmailVerificationConfig(env = process.env, mail = loadMailConfig(env)) {
  const mode = readChoice(
    env,
    "EMAIL_VERIFICATION",
    ["required", "off"],
    mail.enabled ? "required" : "off",
  );
  if (mode === "required" && !mail.enabled) {
    throw new ConfigError("EMAIL_VERIFICATION=required needs MAIL_TRANSPORT=smtp or log");
  }

  return {
    required: mode === "required",
    appBaseUrl: mail.appBaseUrl,
    tokenTtlHours: readInteger(env, "EMAIL_VERIFICATION_TOKEN_TTL_HOURS", 24, {
      min: 1,
      max: 168,
    }),
    retentionDays: readInteger(env, "EMAIL_VERIFICATION_RETENTION_DAYS", 30, {
      min: 1,
      max: 365,
    }),
    resend: {
      windowSeconds: readInteger(env, "EMAIL_VERIFICATION_WINDOW_SECONDS", 3600, {
        min: 60,
        max: 86400,
      }),
      perEmail: readInteger(env, "EMAIL_VERIFICATION_EMAIL_LIMIT", 3, { min: 1, max: 100 }),
      perIp: readInteger(env, "EMAIL_VERIFICATION_IP_LIMIT", 10, { min: 1, max: 1000 }),
    },
    submit: {
      windowSeconds: readInteger(env, "EMAIL_VERIFICATION_SUBMIT_WINDOW_SECONDS", 900, {
        min: 60,
        max: 86400,
      }),
      perIp: readInteger(env, "EMAIL_VERIFICATION_SUBMIT_IP_LIMIT", 20, { min: 1, max: 1000 }),
    },
  };
}

module.exports = { loadEmailVerificationConfig };
