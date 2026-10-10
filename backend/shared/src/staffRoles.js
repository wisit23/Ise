const STAFF_ROLES = Object.freeze([
  "ADMIN",
  "TRUST_AND_SAFETY",
  "CUSTOMER_SERVICE",
]);
function heldRoles(role, roles = []) {
  return new Set(
    [role, ...(Array.isArray(roles) ? roles : [])].filter(Boolean),
  );
}
function isStaff(role, roles = []) {
  const held = heldRoles(role, roles);
  return STAFF_ROLES.some((candidate) => held.has(candidate));
}
function effectiveStaffRole(req) {
  const held = heldRoles(req.userRole, req.userRoles);
  return STAFF_ROLES.find((role) => held.has(role)) || req.userRole;
}
module.exports = { STAFF_ROLES, heldRoles, isStaff, effectiveStaffRole };
