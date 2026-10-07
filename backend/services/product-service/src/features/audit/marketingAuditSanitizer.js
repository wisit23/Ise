/**
 * Sanitizer for Marketing Audit Trail (UR-08 / MKT audit log).
 * Ensures sensitive data (passwords, tokens, secrets, cookies, etc.)
 * is never stored in audit logs or returned in audit API responses.
 */

const SENSITIVE_KEY_REG =
  /password|passwordhash|accesstoken|refreshtoken|token|secret|authorization|cookie|apikey|api_key|credential/i;

function isSensitiveKey(key) {
  if (typeof key !== "string") return false;
  // Normalize key by stripping hyphens and underscores for comparison
  const normalized = key.replace(/[-_]/g, "");
  return SENSITIVE_KEY_REG.test(normalized);
}

const REDACTED = "[REDACTED]";

/**
 * Recursively sanitizes any payload, stripping sensitive fields from objects and arrays.
 * Handles circular references safely using a WeakSet.
 *
 * @param {*} data - Input data of any type
 * @param {WeakSet} [seen] - Internal WeakSet for cycle detection
 * @returns {*} Sanitized clone
 */
function sanitizeAuditData(data, seen = new WeakSet()) {
  if (data === null || data === undefined) {
    return data;
  }

  // Handle primitives
  if (typeof data !== "object") {
    // If it's a string, check if it resembles an Authorization Bearer token or JWT
    if (typeof data === "string") {
      if (/^bearer\s+[a-z0-9._-]+/i.test(data.trim())) {
        return REDACTED;
      }
      if (/^ey[a-z0-9_-]+\.ey[a-z0-9_-]+\.[a-z0-9_-]+/i.test(data.trim())) {
        return REDACTED;
      }
    }
    return data;
  }

  // Handle Date
  if (data instanceof Date) {
    return data.toISOString();
  }

  // Handle cycle detection
  if (seen.has(data)) {
    return "[CIRCULAR]";
  }
  seen.add(data);

  // Handle Array
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeAuditData(item, seen));
  }

  // Handle plain object or instance with properties
  const sanitized = {};
  for (const [key, value] of Object.entries(data)) {
    if (isSensitiveKey(key)) {
      sanitized[key] = REDACTED;
    } else {
      sanitized[key] = sanitizeAuditData(value, seen);
    }
  }

  return sanitized;
}

module.exports = {
  sanitizeAuditData,
  isSensitiveKey,
  REDACTED,
};
