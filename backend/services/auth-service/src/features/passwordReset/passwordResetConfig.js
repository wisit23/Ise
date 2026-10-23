// Settings for the forgot-password flow. Mail delivery comes from the shared
// mailConfig; this module adds the reset-specific lifetimes and rate limits.
const { ConfigError, readInteger } = require("../../config/configReaders");
const { loadMailConfig } = require("../../config/mailConfig");

function loadPasswordResetConfig(env = process.env, mail = loadMailConfig(env)) {
  return {
    enabled: mail.enabled,
    appBaseUrl: mail.appBaseUrl,
    mail,
    tokenTtlMinutes: readInteger(env, "PASSWORD_RESET_TOKEN_TTL_MINUTES", 30, {
      min: 5,
      max: 1440,
    }),
    retentionDays: readInteger(env, "PASSWORD_RESET_RETENTION_DAYS", 30, {
      min: 1,
      max: 365,
    }),
    request: {
      windowSeconds: readInteger(env, "PASSWORD_RESET_WINDOW_SECONDS", 3600, {
        min: 60,
        max: 86400,
      }),
      perEmail: readInteger(env, "PASSWORD_RESET_EMAIL_LIMIT", 3, {
        min: 1,
        max: 100,
      }),
      perIp: readInteger(env, "PASSWORD_RESET_IP_LIMIT", 10, {
        min: 1,
        max: 1000,
      }),
    },
    submit: {
      windowSeconds: readInteger(env, "PASSWORD_RESET_SUBMIT_WINDOW_SECONDS", 900, {
        min: 60,
        max: 86400,
      }),
      perIp: readInteger(env, "PASSWORD_RESET_SUBMIT_IP_LIMIT", 20, {
        min: 1,
        max: 1000,
      }),
    },
  };
}

module.exports = { loadPasswordResetConfig, ConfigError };
