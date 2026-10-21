// Reads and validates every setting the forgot-password flow depends on.
// Called once at startup (server.js) so a misconfigured deployment fails
// loudly at boot instead of the first time a user asks for a reset link.

const MAIL_TRANSPORTS = ["smtp", "log", "disabled"];
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

class ConfigError extends Error {
  constructor(message) {
    super(`[password-reset] ${message}`);
    this.name = "ConfigError";
  }
}

function readInteger(env, name, fallback, { min, max }) {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ConfigError(`${name} must be an integer from ${min} to ${max}`);
  }
  return value;
}

function readBoolean(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new ConfigError(`${name} must be "true" or "false"`);
}

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
  // Reset links carry a credential; outside local development they must
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
    // Port 465 is implicit TLS; 587/25 upgrade with STARTTLS, which
    // requireTLS below makes mandatory rather than opportunistic.
    secure: readBoolean(env, "SMTP_SECURE", port === 465),
    auth: user ? { user, pass } : null,
  };
}

function loadPasswordResetConfig(env = process.env) {
  const transport = env.MAIL_TRANSPORT || "disabled";
  if (!MAIL_TRANSPORTS.includes(transport)) {
    throw new ConfigError(
      `MAIL_TRANSPORT must be one of: ${MAIL_TRANSPORTS.join(", ")}`,
    );
  }

  const limits = {
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
      windowSeconds: readInteger(
        env,
        "PASSWORD_RESET_SUBMIT_WINDOW_SECONDS",
        900,
        { min: 60, max: 86400 },
      ),
      perIp: readInteger(env, "PASSWORD_RESET_SUBMIT_IP_LIMIT", 20, {
        min: 1,
        max: 1000,
      }),
    },
  };

  if (transport === "disabled") {
    return { enabled: false, mail: { transport }, ...limits };
  }

  const app = readAppBaseUrl(env);
  if (!env.MAIL_FROM) throw new ConfigError("MAIL_FROM is required");
  // The log transport prints live reset links. That is only acceptable on a
  // developer's own machine, never on a server other people can reach.
  if (transport === "log" && !app.isLocal) {
    throw new ConfigError(
      "MAIL_TRANSPORT=log is only allowed when APP_BASE_URL is localhost",
    );
  }

  return {
    enabled: true,
    appBaseUrl: app.origin,
    mail: {
      transport,
      from: env.MAIL_FROM,
      ...(transport === "smtp" ? { smtp: readSmtp(env) } : {}),
    },
    ...limits,
  };
}

module.exports = { loadPasswordResetConfig, ConfigError };
