const {
  badRequest,
  conflict,
  forbidden,
  notFound,
  restrictionsForStatus,
  statusForRestrictionScope,
  combineRestrictionStatus,
  removeRestrictionScope,
  isRestrictedStatus,
} = require("@reloop/shared");
const prisma = require("../../models/prismaClient");
const { lockUser } = require("../../services/sessionService");
const authService = require("../../services/authService");

const RESTRICT_ACTION = {
  BUYER: "COMMERCE_RESTRICTED_BUYER",
  SELLER: "COMMERCE_RESTRICTED_SELLER",
  ALL_COMMERCE: "COMMERCE_RESTRICTED_ALL",
};

function normalizeScope(scope) {
  const normalized = String(scope || "")
    .trim()
    .toUpperCase();
  if (!statusForRestrictionScope(normalized)) {
    throw badRequest("scope must be BUYER, SELLER or ALL_COMMERCE");
  }
  return normalized;
}

function requireReason(reason) {
  const normalized = String(reason || "").trim();
  if (!normalized) throw badRequest("reason is required");
  if (normalized.length > 1000) throw badRequest("reason is too long");
  return normalized;
}

function assertScopeMatchesRoles(scope, roles) {
  const customerRoles = new Set(
    roles.filter((role) => ["BUYER", "SELLER"].includes(role)),
  );
  if (customerRoles.size === 0) {
    throw conflict(
      "commerce restrictions apply only to buyer or seller accounts",
    );
  }
  if (scope === "BUYER" && !customerRoles.has("BUYER")) {
    throw conflict("target account does not have the BUYER role");
  }
  if (scope === "SELLER" && !customerRoles.has("SELLER")) {
    throw conflict("target account does not have the SELLER role");
  }
}

function responseFor(user, event = null, { includeInternal = false } = {}) {
  return {
    userId: user.id,
    accountStatus: user.status,
    commerceRestrictions: restrictionsForStatus(user.status),
    latestEvent: event
      ? {
          id: event.id,
          action: event.action,
          reason: event.reason,
          createdAt: event.createdAt,
          ...(includeInternal
            ? { actorId: event.actorId, requestId: event.requestId }
            : {}),
        }
      : null,
    appealAvailable: true,
    appealSubmissionAvailable: false,
    appealUnavailableReason:
      "ยังไม่มี persistence contract สำหรับเก็บคำอุทธรณ์และหลักฐานแบบ durable",
  };
}

async function restrict({ targetId, actorId, scope, reason, requestId }) {
  if (targetId === actorId) throw forbidden("staff cannot restrict themselves");
  const normalizedScope = normalizeScope(scope);
  const normalizedReason = requireReason(reason);

  return prisma.$transaction(async (tx) => {
    const user = await lockUser(tx, targetId);
    if (!user) throw notFound("user not found");
    if (user.status === "SUSPENDED") {
      throw conflict(
        "fully suspended accounts must be restored before applying a commerce restriction",
      );
    }

    const roles = await authService.getUserRoles(targetId, tx);
    assertScopeMatchesRoles(normalizedScope, roles);
    const nextStatus = combineRestrictionStatus(user.status, normalizedScope);
    if (!nextStatus)
      throw conflict("account status cannot accept a commerce restriction");
    if (nextStatus === user.status)
      throw conflict("commerce scope is already restricted");

    const updated = await tx.user.update({
      where: { id: targetId },
      data: { status: nextStatus },
    });
    const event = await tx.adminAudit.create({
      data: {
        actorId,
        action: RESTRICT_ACTION[normalizedScope],
        targetId,
        reason: normalizedReason,
        requestId: requestId || null,
      },
    });
    return responseFor(updated, event, { includeInternal: true });
  });
}

async function revoke({ targetId, actorId, scope, reason, requestId }) {
  if (targetId === actorId) throw forbidden("staff cannot restore themselves");
  const normalizedScope = normalizeScope(scope || "ALL_COMMERCE");
  const normalizedReason = requireReason(reason);

  return prisma.$transaction(async (tx) => {
    const user = await lockUser(tx, targetId);
    if (!user) throw notFound("user not found");
    if (!isRestrictedStatus(user.status)) {
      throw conflict("account has no active commerce restriction");
    }
    const nextStatus = removeRestrictionScope(user.status, normalizedScope);
    if (nextStatus === user.status)
      throw conflict("requested scope is not restricted");

    const updated = await tx.user.update({
      where: { id: targetId },
      data: { status: nextStatus },
    });
    const event = await tx.adminAudit.create({
      data: {
        actorId,
        action: "COMMERCE_RESTRICTION_REVOKED",
        targetId,
        reason: normalizedReason,
        requestId: requestId || null,
      },
    });
    return responseFor(updated, event, { includeInternal: true });
  });
}

async function getForUser(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound("user not found");
  const event = isRestrictedStatus(user.status)
    ? await prisma.adminAudit.findFirst({
        where: {
          targetId: userId,
          action: { in: Object.values(RESTRICT_ACTION) },
        },
        orderBy: { createdAt: "desc" },
      })
    : null;
  return responseFor(user, event);
}

module.exports = { restrict, revoke, getForUser };
