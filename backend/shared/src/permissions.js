const ROLE_PERMISSIONS = {
  BUYER: ["order:read:own", "order:write:own", "report:create"],
  SELLER: [
    "product:write",
    "product:read:own",
    "order:read:own",
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
  permissionsForRoles,
  hasPermission,
};
