import { apiFetch } from "./api";

// Mirrors auth-service's passwordPolicy so the form can explain a problem
// before the round trip; the server still enforces the same rules.
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_BYTES = 72;

function utf8ByteLength(text) {
  let bytes = 0;
  for (const char of text) {
    const code = char.codePointAt(0);
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

export function passwordProblem(password, confirmation) {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (utf8ByteLength(password) > PASSWORD_MAX_BYTES) {
    return "That password is too long. Use a shorter one.";
  }
  if (password !== confirmation) return "The two passwords don't match.";
  return null;
}

export function requestPasswordReset(email) {
  return apiFetch("/api/auth/password/forgot", {
    method: "POST",
    body: { email },
  });
}

export function verifyResetToken(token) {
  return apiFetch("/api/auth/password/reset/verify", {
    method: "POST",
    body: { token },
  });
}

export function resetPassword(token, password) {
  return apiFetch("/api/auth/password/reset", {
    method: "POST",
    body: { token, password },
  });
}

/**
 * The emailed link carries the token in the URL fragment (#token=...), which
 * browsers never send to a server. Read it once, then strip it from the
 * address bar and history so it can't leak through a shared screen,
 * a bookmark or browser sync.
 */
export function takeResetTokenFromUrl() {
  const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
  if (window.location.hash) {
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
  }
  return token || null;
}

export function isInvalidTokenError(error) {
  return error?.code === "RESET_TOKEN_INVALID";
}
