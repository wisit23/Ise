const { displayNames } = require("@reloop/shared");
const prisma = require("../../models/prismaClient");

/**
 * One ticket for the Executive details dialog: who raised it, about what and
 * which order, who has it now, and every status change with who made it and
 * why. Names belong to auth-service and are asked through its API; when it
 * cannot answer, the ids still come back and `meta.namesAvailable` is false,
 * so the page says so instead of showing blanks. Chat and internal notes are
 * not returned (CEO-DEC-015).
 */

async function namesFor(ids) {
  try {
    const rows = await displayNames(ids);
    return new Map(rows.map((row) => [row.userId, row.displayName]));
  } catch {
    return null;
  }
}

const iso = (value) => (value ? value.toISOString() : null);

async function getExecutiveTicket(id) {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id },
    include: {
      category: true,
      priority: true,
      currentStatus: true,
      assignments: { orderBy: { assignedAt: "desc" } },
      statusHistory: {
        orderBy: { createdAt: "asc" },
        include: { fromStatus: true, toStatus: true },
      },
    },
  });
  if (!ticket) return null;

  // The current holder, or else whoever had it last.
  const assignment =
    ticket.assignments.find((a) => !a.endedAt) ?? ticket.assignments[0] ?? null;

  const names = await namesFor(
    [
      ticket.requesterId,
      assignment?.assigneeId,
      ...ticket.statusHistory.map((h) => h.changedById),
    ].filter(Boolean),
  );
  const person = (userId) =>
    userId ? { id: userId, name: names?.get(userId) ?? null } : null;

  return {
    data: {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      ...(ticket.referenceCode ? { referenceCode: ticket.referenceCode } : {}),
      subject: ticket.subject,
      description: ticket.description,
      requester: person(ticket.requesterId),
      category: { code: ticket.category.code, name: ticket.category.nameTh },
      priority: { code: ticket.priority.code, name: ticket.priority.name },
      status: {
        code: ticket.currentStatus.code,
        name: ticket.currentStatus.name,
        isTerminal: ticket.currentStatus.isTerminal,
      },
      orderId: ticket.orderId ?? null,
      createdAt: iso(ticket.createdAt),
      assignee: assignment
        ? {
            ...person(assignment.assigneeId),
            assignedAt: iso(assignment.assignedAt),
            current: !assignment.endedAt,
          }
        : null,
      actions: ticket.statusHistory.map((h) => ({
        at: iso(h.createdAt),
        by: person(h.changedById),
        from: h.fromStatus ? h.fromStatus.code : null,
        to: h.toStatus.code,
        reason: h.reason ?? null,
      })),
    },
    meta: { namesAvailable: names !== null },
  };
}

module.exports = { getExecutiveTicket };
