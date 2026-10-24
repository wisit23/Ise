const { displayNames } = require("@reloop/shared");
const prisma = require("../../models/prismaClient");
const orderClient = require("../../services/orderClient");

/**
 * One ticket for the Executive details dialog, laid out like a dispute's: who
 * opened it and when, the product it is about (only when it names an order),
 * its status, who took the case, and who handled it, as what (their staff
 * role), with what outcome and why. "Handled" is the latest change to a
 * closing status (RESOLVED or CLOSED). The ticket text, chat and notes are not
 * returned (CEO-DEC-015).
 *
 * Names and staff roles belong to auth-service and the product to the order
 * (order-service keeps the title it was sold under); both are asked through
 * their APIs. When one cannot answer, the ids still come back and `meta` says
 * what is missing, so the page shows "ไม่พร้อมใช้งาน" instead of a blank.
 */

// The statuses that mean an agent has dealt with the case.
const HANDLED_STATUSES = ["RESOLVED", "CLOSED"];

async function peopleFor(ids) {
  try {
    const rows = await displayNames(ids);
    return new Map(rows.map((row) => [row.userId, row]));
  } catch {
    return null;
  }
}

async function productFor(orderId) {
  try {
    const order = await orderClient.getOrder(orderId);
    if (!order) return { available: true, product: null };
    return {
      available: true,
      product: order.productId
        ? { id: order.productId, title: order.productTitle ?? null }
        : null,
    };
  } catch {
    return { available: false, product: null };
  }
}

const iso = (value) => (value ? value.toISOString() : null);

async function getExecutiveTicket(id) {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id },
    include: {
      currentStatus: true,
      assignments: { orderBy: { assignedAt: "desc" } },
      statusHistory: {
        where: { toStatus: { code: { in: HANDLED_STATUSES } } },
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { toStatus: true },
      },
    },
  });
  if (!ticket) return null;

  // The current holder, or else whoever had it last.
  const assignment =
    ticket.assignments.find((a) => !a.endedAt) ?? ticket.assignments[0] ?? null;
  // Only a ticket that is closed now has been handled: one reopened after
  // RESOLVED is being worked on again, so its old outcome is not shown.
  const handling = HANDLED_STATUSES.includes(ticket.currentStatus.code)
    ? (ticket.statusHistory[0] ?? null)
    : null;

  const [people, product] = await Promise.all([
    peopleFor(
      [
        ticket.requesterId,
        assignment?.assigneeId,
        handling?.changedById,
      ].filter(Boolean),
    ),
    ticket.orderId
      ? productFor(ticket.orderId)
      : { available: true, product: null },
  ]);
  const person = (userId, { withRoles = false } = {}) => {
    if (!userId) return null;
    const found = people?.get(userId);
    return {
      id: userId,
      name: found?.displayName ?? null,
      ...(withRoles ? { roles: found?.staffRoles ?? [] } : {}),
    };
  };

  return {
    data: {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      subject: ticket.subject,
      requester: person(ticket.requesterId),
      createdAt: iso(ticket.createdAt),
      orderId: ticket.orderId ?? null,
      product: product.product,
      status: {
        code: ticket.currentStatus.code,
        name: ticket.currentStatus.name,
      },
      assignee: assignment
        ? {
            ...person(assignment.assigneeId, { withRoles: true }),
            assignedAt: iso(assignment.assignedAt),
            current: !assignment.endedAt,
          }
        : null,
      handling: handling
        ? {
            by: person(handling.changedById, { withRoles: true }),
            at: iso(handling.createdAt),
            outcome: handling.toStatus.code,
            reason: handling.reason ?? null,
          }
        : null,
    },
    meta: {
      namesAvailable: people !== null,
      productAvailable: product.available,
    },
  };
}

module.exports = { getExecutiveTicket, HANDLED_STATUSES };
