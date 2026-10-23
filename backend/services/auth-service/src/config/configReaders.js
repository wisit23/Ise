// Small, strict environment readers shared by auth-service's config modules.
// Every reader throws ConfigError on a bad value so a misconfigured
// deployment fails at boot with a message naming the variable.

class ConfigError extends Error {
  constructor(message) {
    super(`[config] ${message}`);
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

function readChoice(env, name, choices, fallback) {
  const value = env[name] || fallback;
  if (!choices.includes(value)) {
    throw new ConfigError(`${name} must be one of: ${choices.join(", ")}`);
  }
  return value;
}

module.exports = { ConfigError, readInteger, readBoolean, readChoice };
