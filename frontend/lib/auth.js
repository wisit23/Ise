const ACCESS_KEY = "reloop_access_token";
const REFRESH_KEY = "reloop_refresh_token";
const USER_KEY = "reloop_user";

export const CUSTOMER_ROLES = ["BUYER", "SELLER"];
export const STAFF_ROLES = [
  "CUSTOMER_SERVICE",
  "ADMIN",
  "TRUST_AND_SAFETY",
  "MARKETING",
  "EXECUTIVE",
];
function notifyAuthChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("reloop:auth"));
  }
}

export function saveSession({ accessToken, refreshToken, user }) {
  localStorage.setItem(ACCESS_KEY, accessToken);
  localStorage.setItem(REFRESH_KEY, refreshToken);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  notifyAuthChange();
}

export function getAccessToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_KEY);
}

export function setAccessToken(accessToken) {
  localStorage.setItem(ACCESS_KEY, accessToken);
  notifyAuthChange();
}

export function getRefreshToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_KEY);
}

export function getStoredUser() {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

function decodeJwtPayload(token) {
  if (!token) return null;
  try {
    const encoded = token.split(".")[1];
    if (!encoded) return null;
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

export function getAccessTokenClaims() {
  return decodeJwtPayload(getAccessToken());
}

/** Uses the signed token's multi-role claim, falling back to the stored legacy role. */
export function getCurrentRoles() {
  const claims = getAccessTokenClaims();
  if (Array.isArray(claims?.roles) && claims.roles.length > 0) {
    return [...new Set(claims.roles)];
  }
  const fallbackRole = claims?.role || getStoredUser()?.role;
  return fallbackRole ? [fallbackRole] : [];
}

export function isValidRoleCombinationRoles(roles = []) {
  const unique = [...new Set(roles)];
  const knownRoles = [...CUSTOMER_ROLES, ...STAFF_ROLES];
  if (
    unique.length === 0 ||
    unique.some((role) => !knownRoles.includes(role))
  ) {
    return false;
  }

  const customerCount = unique.filter((role) =>
    CUSTOMER_ROLES.includes(role),
  ).length;
  const staffCount = unique.filter((role) => STAFF_ROLES.includes(role)).length;
  if (staffCount > 0) return staffCount === 1 && customerCount === 0;
  return customerCount > 0;
}

/** Mirrors the backend rule: customer roles only, never mixed with staff. */
export function isCustomerAccountRoles(roles = []) {
  const unique = [...new Set(roles)];
  return (
    isValidRoleCombinationRoles(unique) &&
    unique.every((role) => CUSTOMER_ROLES.includes(role))
  );
}

export function canPurchaseProduct({
  isAuthenticated,
  userId,
  roles = [],
  sellerId,
}) {
  if (userId && userId === sellerId) return false;
  // Guests may see the CTA and are sent to login when they use it.
  if (!isAuthenticated) return true;
  return isCustomerAccountRoles(roles);
}

export function clearSession() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
  notifyAuthChange();
}
