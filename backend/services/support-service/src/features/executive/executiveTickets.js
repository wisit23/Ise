const prisma = require("../../models/prismaClient");

/**
 * Tickets for the Executive complaints page: a read-only list over a date
 * range, filtered by status, category and priority, which are tables of their
 * own here (ticket_statuses, ticket_categories, ticket_priorities). Only what
 * the page shows comes back: no requester, assignee, chat or notes.
 */

const toItem = (ticket) => ({
  id: ticket.id,
  ticketNumber: ticket.ticketNumber,
  subject: ticket.subject,
  category: { code: ticket.category.code, name: ticket.category.nameTh },
  priority: { code: ticket.priority.code, name: ticket.priority.name },
  status: {
    code: ticket.currentStatus.code,
    name: ticket.currentStatus.name,
    isTerminal: ticket.currentStatus.isTerminal,
  },
  orderId: ticket.orderId ?? null,
  createdAt: ticket.createdAt.toISOString(),
});

/** The values each filter offers, read from the reference tables. */
async function getTicketOptions() {
  const [statuses, categories, priorities] = await Promise.all([
    prisma.ticketStatus.findMany({
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    }),
    prisma.ticketCategory.findMany({
      where: { isActive: true },
      orderBy: { id: "asc" },
    }),
    prisma.ticketPriority.findMany({
      where: { isActive: true },
      orderBy: { rank: "asc" },
    }),
  ]);
  return {
    statuses: statuses.map((s) => ({ code: s.code, name: s.name })),
    categories: categories.map((c) => ({ code: c.code, name: c.nameTh })),
    priorities: priorities.map((p) => ({ code: p.code, name: p.name })),
  };
}

/**
 * Tickets opened in [from, to). The status counts describe the same range,
 * category and priority but ignore the status filter, so each status chip can
 * show how many it would give.
 */
async function listExecutiveTickets({
  from,
  to,
  status,
  category,
  priority,
  skip,
  take,
}) {
  const base = {
    createdAt: { gte: from, lt: to },
    ...(category ? { category: { code: category } } : {}),
    ...(priority ? { priority: { code: priority } } : {}),
  };
  const where = {
    ...base,
    ...(status ? { currentStatus: { code: status } } : {}),
  };

  const [rows, total, grouped, statuses] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip,
      take,
      include: { category: true, priority: true, currentStatus: true },
    }),
    prisma.supportTicket.count({ where }),
    prisma.supportTicket.groupBy({
      by: ["currentStatusId"],
      where: base,
      _count: { _all: true },
    }),
    prisma.ticketStatus.findMany({ select: { id: true, code: true } }),
  ]);

  const codeById = new Map(statuses.map((s) => [s.id, s.code]));
  const statusCounts = Object.fromEntries(statuses.map((s) => [s.code, 0]));
  for (const group of grouped) {
    statusCounts[codeById.get(group.currentStatusId)] = group._count._all;
  }

  return { items: rows.map(toItem), total, statusCounts };
}

module.exports = { listExecutiveTickets, getTicketOptions };
