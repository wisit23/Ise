// Outbound email settings shared by every feature that mails users
// (password reset, email verification). One source of truth, validated once.
const { ConfigError, readInteger, readBoolean, readChoice } = require("./configReaders");

const MAIL_TRANSPORTS = ["smtp", "log", "disabled"];
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function readAppBaseUrl(env) {
  const raw = env.APP_BASE_URL;
  if (!raw) throw new ConfigError("APP_BASE_URL is required");
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new ConfigError("APP_BASE_URL must be an absolute URL");
  }
  const isLocal = LOCAL_HOSTS.has(url.hostname);
  // Emailed links carry credentials; outside local development they must
  // only ever travel over TLS.
  if (url.protocol !== "https:" && !(isLocal && url.protocol === "http:")) {
    throw new ConfigError("APP_BASE_URL must use https outside localhost");
  }
  return { origin: url.origin, isLocal };
}

function readSmtp(env) {
  if (!env.SMTP_HOST) throw new ConfigError("SMTP_HOST is required");
  const port = readInteger(env, "SMTP_PORT", 587, { min: 1, max: 65535 });
  const user = env.SMTP_USER || "";
  const pass = env.SMTP_PASS || "";
  if (Boolean(user) !== Boolean(pass)) {
    throw new ConfigError("SMTP_USER and SMTP_PASS must be set together");
  }
  return {
    host: env.SMTP_HOST,
    port,
    // Port 465 is implicit TLS; 587/25 upgrade with STARTTLS, which the
    // mailer makes mandatory rather than opportunistic.
    secure: readBoolean(env, "SMTP_SECURE", port === 465),
    auth: user ? { user, pass } : null,
  };
}

/**
 * MAIL_TRANSPORT:
 *   smtp     - send through SMTP_* (any shared or public server)
 *   log      - print messages, live links included; localhost only
 *   disabled - default; features that need email report themselves off
 */
function loadMailConfig(env = process.env) {
  const transport = readChoice(env, "MAIL_TRANSPORT", MAIL_TRANSPORTS, "disabled");
  if (transport === "disabled") return { enabled: false, transport };

  const app = readAppBaseUrl(env);
  if (!env.MAIL_FROM) throw new ConfigError("MAIL_FROM is required");
  // The log transport prints live links. That is only acceptable on a
  // developer's own machine, never on a server other people can reach.
  if (transport === "log" && !app.isLocal) {
    throw new ConfigError(
      "MAIL_TRANSPORT=log is only allowed when APP_BASE_URL is localhost",
    );
  }
  return {
    enabled: true,
    transport,
    appBaseUrl: app.origin,
    from: env.MAIL_FROM,
    ...(transport === "smtp" ? { smtp: readSmtp(env) } : {}),
  };
}

module.exports = { loadMailConfig };
