const STAFF_ROLES = ["ADMIN", "TRUST_AND_SAFETY", "CUSTOMER_SERVICE"];

function effectiveStaffRole(req) {
  const roles = new Set([
    req.userRole,
    ...(Array.isArray(req.userRoles) ? req.userRoles : []),
  ]);
  return STAFF_ROLES.find((role) => roles.has(role)) || req.userRole;
}

module.exports = { effectiveStaffRole };
