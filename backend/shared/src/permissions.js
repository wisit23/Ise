const ROLE_PERMISSIONS = {
  BUYER: [
    "order:read:own",
    "order:write:own",
    "order:purchase",
    "report:create",
  ],
  SELLER: [
    "product:write",
    "product:read:own",
    "order:read:own",
    "order:purchase",
    "report:create",
  ],
  CUSTOMER_SERVICE: [
    "support:case:read",
    "support:case:write",
    "order:read:any",
    "report:read",
    "report:action",
    "report:create",
  ],
  ADMIN: [
    "admin:kyc:decide",
    "admin:user:suspend",
    "admin:user:ban",
    "admin:report:read",
    "admin:report:action",
    "admin:moderation:remove",
    "admin:dispute:hold",
    "admin:dispute:release",
    "admin:bulk:execute",
    "admin:audit:read",
    "support:case:read",
    "order:read:any",
    "report:create",
  ],
  MARKETING: ["campaign:write", "campaign:read", "analytics:read:marketing"],
  EXECUTIVE: ["analytics:read:executive", "admin:audit:read"],
};

const ALL_ROLES = Object.keys(ROLE_PERMISSIONS);
const CUSTOMER_ROLES = ["BUYER", "SELLER"];
const STAFF_ROLES = [
  "CUSTOMER_SERVICE",
  "ADMIN",
  "TRUST_AND_SAFETY",
  "MARKETING",
  "EXECUTIVE",
];

/**
 * Customer accounts may hold BUYER + SELLER together. Staff accounts are
 * deliberately separate: one staff role per account, with no customer role,
 * so privileged work and personal marketplace transactions never share an
 * identity or audit trail.
 */
function isValidRoleCombination(roles = []) {
  const unique = [...new Set(roles)];
  if (unique.length === 0 || unique.some((role) => !ALL_ROLES.includes(role))) {
    return false;
  }

  const customerCount = unique.filter((role) =>
    CUSTOMER_ROLES.includes(role),
  ).length;
  const staffCount = unique.filter((role) => STAFF_ROLES.includes(role)).length;

  if (staffCount > 0) return staffCount === 1 && customerCount === 0;
  return customerCount > 0;
}

function isCustomerAccount(roles = []) {
  const unique = [...new Set(roles)];
  return (
    isValidRoleCombination(unique) &&
    unique.some((role) => CUSTOMER_ROLES.includes(role))
  );
}

function permissionsForRoles(roles = []) {
  const set = new Set();
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role] || []) set.add(permission);
  }
  return [...set];
}

function hasPermission(roles, permission) {
  return permissionsForRoles(roles).includes(permission);
}

module.exports = {
  ROLE_PERMISSIONS,
  ALL_ROLES,
  CUSTOMER_ROLES,
  STAFF_ROLES,
  permissionsForRoles,
  hasPermission,
  isValidRoleCombination,
  isCustomerAccount,
};
