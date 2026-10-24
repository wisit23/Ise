const { displayNames } = require("@reloop/shared");
const prisma = require("../../models/prismaClient");
const productClient = require("../../services/productClient");

/**
 * One dispute for the Executive details dialog: who opened it, which order,
 * shop and product it is about, who is handling it, who decided, what and
 * why. People's names belong to auth-service and product titles to
 * product-service, so both are asked through their APIs; when either cannot
 * answer, the ids still come back and `meta` says what is missing, so the
 * page shows "ไม่พร้อมใช้งาน" instead of a blank or a guess. Evidence and chat
 * are deliberately not returned (CEO-DEC-015).
 */

async function namesFor(ids) {
  try {
    const rows = await displayNames(ids);
    return new Map(rows.map((row) => [row.userId, row]));
  } catch {
    return null;
  }
}

async function titleOf(productId) {
  try {
    const product = await productClient.getProduct(productId);
    return { available: true, title: product?.title ?? null };
  } catch {
    return { available: false, title: null };
  }
}

const toIso = (value) => (value ? new Date(value).toISOString() : null);

async function getExecutiveDispute(id) {
  const row = await prisma.disputeCase.findUnique({
    where: { id },
    include: { order: true },
  });
  if (!row) return null;

  const order = row.order;
  const people = {
    buyer: row.createdBy,
    seller: order?.sellerId ?? null,
    assignee: row.assignedTo ?? null,
    decider: row.decidedBy ?? null,
  };
  const [names, product] = await Promise.all([
    namesFor(Object.values(people).filter(Boolean)),
    order?.productId
      ? titleOf(order.productId)
      : { available: true, title: null },
  ]);
  const person = (userId, { withRoles = false } = {}) => {
    if (!userId) return null;
    const found = names?.get(userId);
    return {
      id: userId,
      name: found?.displayName ?? null,
      // Staff roles say which team acted (CS, Trust & Safety, Admin).
      ...(withRoles ? { roles: found?.staffRoles ?? [] } : {}),
    };
  };

  return {
    data: {
      id: row.id,
      reason: row.reason,
      disputeType: row.disputeType,
      // A recorded decision is final whatever the workflow says next.
      status: row.decision ? "DECIDED" : row.status || "OPEN",
      priority: row.priority,
      createdAt: toIso(row.createdAt),
      order: order
        ? {
            id: order.id,
            amount: Number(order.ordersAmount),
            orderType: order.orderType,
          }
        : { id: row.orderId, amount: null, orderType: null },
      product: order?.productId
        ? { id: order.productId, title: product.title }
        : null,
      buyer: person(people.buyer),
      seller: person(people.seller),
      assignee: person(people.assignee, { withRoles: true }),
      assignedRole: row.assignedRole ?? null,
      assignedAt: toIso(row.assignedAt),
      decision: row.decision ?? null,
      decisionReason: row.decisionReason ?? null,
      decider: person(people.decider, { withRoles: true }),
      decidedAt: toIso(row.decidedAt),
      decisionDueAt: toIso(row.decisionDueAt),
    },
    meta: {
      namesAvailable: names !== null,
      productAvailable: product.available,
    },
  };
}

module.exports = { getExecutiveDispute };
