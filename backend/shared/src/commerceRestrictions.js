const RESTRICTION_STATUS = Object.freeze({
  BUYER: "RESTRICTED_BUYER",
  SELLER: "RESTRICTED_SELLER",
  ALL_COMMERCE: "RESTRICTED_ALL_COMMERCE",
});

const CAPABILITY = Object.freeze({
  BUYER: "BUYER_COMMERCE",
  SELLER: "SELLER_COMMERCE",
});

function restrictionsForStatus(status) {
  if (status === RESTRICTION_STATUS.BUYER) return [CAPABILITY.BUYER];
  if (status === RESTRICTION_STATUS.SELLER) return [CAPABILITY.SELLER];
  if (status === RESTRICTION_STATUS.ALL_COMMERCE) {
    return [CAPABILITY.BUYER, CAPABILITY.SELLER];
  }
  return [];
}

function isRestrictedStatus(status) {
  return restrictionsForStatus(status).length > 0;
}

function statusForRestrictionScope(scope) {
  const normalized = String(scope || "")
    .trim()
    .toUpperCase();
  return RESTRICTION_STATUS[normalized] || null;
}

function combineRestrictionStatus(currentStatus, requestedScope) {
  const requestedStatus = statusForRestrictionScope(requestedScope);
  if (!requestedStatus) return null;
  if (currentStatus === "ACTIVE") return requestedStatus;
  if (currentStatus === requestedStatus) return requestedStatus;
  if (isRestrictedStatus(currentStatus)) {
    return RESTRICTION_STATUS.ALL_COMMERCE;
  }
  return null;
}

function removeRestrictionScope(currentStatus, scope) {
  const normalized = String(scope || "ALL_COMMERCE")
    .trim()
    .toUpperCase();
  if (!isRestrictedStatus(currentStatus)) return null;
  if (normalized === "ALL_COMMERCE") return "ACTIVE";
  if (currentStatus === RESTRICTION_STATUS.BUYER && normalized === "BUYER") {
    return "ACTIVE";
  }
  if (currentStatus === RESTRICTION_STATUS.SELLER && normalized === "SELLER") {
    return "ACTIVE";
  }
  if (currentStatus === RESTRICTION_STATUS.ALL_COMMERCE) {
    if (normalized === "BUYER") return RESTRICTION_STATUS.SELLER;
    if (normalized === "SELLER") return RESTRICTION_STATUS.BUYER;
  }
  return currentStatus;
}

function requireCommerceCapability(capability) {
  return (req, res, next) => {
    if (!req.commerceRestrictions?.includes(capability)) return next();
    return res.status(403).json({
      error: {
        code: "COMMERCE_RESTRICTED",
        message:
          capability === CAPABILITY.SELLER
            ? "สิทธิ์การขายของบัญชีนี้ถูกระงับ คุณยังดูข้อมูลและยื่นอุทธรณ์ได้"
            : "สิทธิ์การซื้อของบัญชีนี้ถูกระงับ คุณยังดูข้อมูลและยื่นอุทธรณ์ได้",
        scope: capability,
        requestId: req.id,
      },
    });
  };
}

module.exports = {
  RESTRICTION_STATUS,
  CAPABILITY,
  restrictionsForStatus,
  isRestrictedStatus,
  statusForRestrictionScope,
  combineRestrictionStatus,
  removeRestrictionScope,
  requireCommerceCapability,
};
