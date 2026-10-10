const { badRequest, conflict, forbidden, notFound } = require("@reloop/shared");
const prisma = require("../../models/prismaClient");

const BUYER_ACTIVITY_ACTIONS = Object.freeze([
  "PRODUCT_VIEWED",
  "SEARCHED",
  "CART_ITEM_ADDED",
  "CART_ITEM_REMOVED",
  "WISHLIST_ADDED",
  "WISHLIST_REMOVED",
  "CHECKOUT_STARTED",
  "ORDER_PLACED",
  "ORDER_CANCELLED",
  "PAYMENT_COMPLETED",
  "REVIEW_CREATED",
  "PROFILE_UPDATED",
]);

// Browser clients may only report low-risk interaction events. Order/payment/
// review facts must come from a trusted service through the internal endpoint.
const SELF_REPORTED_ACTIONS = new Set([
  "PRODUCT_VIEWED",
  "SEARCHED",
  "CART_ITEM_ADDED",
  "CART_ITEM_REMOVED",
  "WISHLIST_ADDED",
  "WISHLIST_REMOVED",
  "CHECKOUT_STARTED",
]);
const ALL_ACTIONS = new Set(BUYER_ACTIVITY_ACTIONS);
const MAX_METADATA_BYTES = 4096;

function cleanOptionalText(value, field, maxLength = 255) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw badRequest(`${field} must be a string`);
  const clean = value.trim();
  if (!clean) return null;
  if (clean.length > maxLength) {
    throw badRequest(`${field} must be at most ${maxLength} characters`);
  }
  return clean;
}

function cleanMetadata(metadata) {
  if (metadata === undefined || metadata === null) return null;
  if (typeof metadata !== "object" || Array.isArray(metadata)) {
    throw badRequest("metadata must be an object");
  }
  let encoded;
  try {
    encoded = JSON.stringify(metadata);
  } catch {
    throw badRequest("metadata must be JSON serializable");
  }
  if (Buffer.byteLength(encoded, "utf8") > MAX_METADATA_BYTES) {
    throw badRequest(`metadata must be at most ${MAX_METADATA_BYTES} bytes`);
  }
  return metadata;
}

function cleanOccurredAt(value) {
  if (!value) return new Date();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw badRequest("occurredAt is invalid");
  if (date.getTime() > Date.now() + 5 * 60 * 1000) {
    throw badRequest("occurredAt cannot be in the future");
  }
  return date;
}

async function assertBuyer(buyerId) {
  const user = await prisma.user.findUnique({
    where: { id: buyerId },
    select: { role: true, roles: { select: { role: true } } },
  });
  if (!user) throw notFound("buyer not found");
  const roles = user.roles.length
    ? user.roles.map((assignment) => assignment.role)
    : [user.role];
  if (!roles.includes("BUYER")) throw forbidden("user is not a buyer");
}

function validateAction(action, allowedActions = ALL_ACTIONS) {
  if (!allowedActions.has(action)) {
    throw badRequest(
      `action must be one of: ${[...allowedActions].join(", ")}`,
    );
  }
}

async function createActivity({
  buyerId,
  action,
  source,
  targetType,
  targetId,
  metadata,
  requestId,
  ipAddress,
  userAgent,
  occurredAt,
  allowedActions = ALL_ACTIONS,
}) {
  validateAction(action, allowedActions);
  await assertBuyer(buyerId);

  const data = {
    buyerId,
    action,
    source: cleanOptionalText(source, "source", 50),
    targetType: cleanOptionalText(targetType, "targetType", 50),
    targetId: cleanOptionalText(targetId, "targetId"),
    metadata: cleanMetadata(metadata),
    requestId: cleanOptionalText(requestId, "requestId"),
    ipAddress: cleanOptionalText(ipAddress, "ipAddress", 100),
    userAgent: cleanOptionalText(userAgent, "userAgent", 500),
    occurredAt: cleanOccurredAt(occurredAt),
  };

  if (!data.source) throw badRequest("source is required");

  try {
    const item = await prisma.buyerActivityLog.create({ data });
    return { item, created: true };
  } catch (err) {
    if (err.code !== "P2002" || !data.requestId) throw err;
    const existing = await prisma.buyerActivityLog.findUnique({
      where: { requestId: data.requestId },
    });
    if (
      !existing ||
      existing.buyerId !== buyerId ||
      existing.action !== action ||
      existing.source !== data.source
    ) {
      throw conflict("requestId is already used by another activity");
    }
    return { item: existing, created: false };
  }
}

function recordOwnActivity(buyerId, payload, context) {
  return createActivity({
    ...payload,
    // Identity always comes from the verified JWT, never the request body.
    buyerId,
    source: "WEB",
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    allowedActions: SELF_REPORTED_ACTIONS,
  });
}

function recordInternalActivity(payload, context) {
  if (!payload || typeof payload !== "object") {
    throw badRequest("activity payload is required");
  }
  return createActivity({
    ...payload,
    ipAddress: payload.ipAddress || context.ipAddress,
    userAgent: payload.userAgent,
  });
}

function parseDateFilter(value, field) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw badRequest(`${field} is invalid`);
  return date;
}

async function listActivity(buyerId, { page, limit, action, from, to }) {
  await assertBuyer(buyerId);
  if (action) validateAction(action);
  const fromDate = parseDateFilter(from, "from");
  const toDate = parseDateFilter(to, "to");
  if (fromDate && toDate && fromDate > toDate) {
    throw badRequest("from must be before to");
  }

  const where = {
    buyerId,
    ...(action ? { action } : {}),
    ...(fromDate || toDate
      ? {
          occurredAt: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.buyerActivityLog.findMany({
      where,
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.buyerActivityLog.count({ where }),
  ]);
  return { items, total };
}

async function listLoginHistory(buyerId, { page, limit }) {
  await assertBuyer(buyerId);
  const where = { userId: buyerId };
  const [rows, total] = await Promise.all([
    prisma.loginLog.findMany({
      where,
      select: {
        id: true,
        loginAt: true,
        logoutAt: true,
        ipAddress: true,
        userAgent: true,
      },
      orderBy: [{ loginAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.loginLog.count({ where }),
  ]);
  return { items: rows, total };
}

module.exports = {
  BUYER_ACTIVITY_ACTIONS,
  recordOwnActivity,
  recordInternalActivity,
  listActivity,
  listLoginHistory,
};
