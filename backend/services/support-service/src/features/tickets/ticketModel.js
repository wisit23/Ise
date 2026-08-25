const prisma = require("../../models/prismaClient");

function generateTicketNumber() {
  const n = Math.floor(Math.random() * 900000) + 100000;
  return `#CS-${n}`;
}

async function create(data) {
  // Retry on the rare ticketNumber collision instead of trusting a single
  // random draw — @unique on ticketNumber makes Prisma throw P2002 for it.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.supportTicket.create({
        data: { ...data, ticketNumber: generateTicketNumber() },
      });
    } catch (err) {
      if (err.code === "P2002" && attempt < 4) continue;
      throw err;
    }
  }
}

function findById(id) {
  return prisma.supportTicket.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
}

async function listByRequester(requesterId, { skip, take } = {}) {
  const where = { requesterId };
  const [items, total] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.supportTicket.count({ where }),
  ]);
  return { items, total };
}

/** Agent queue. scope: "unassigned" (default) | "mine" | "all" — "mine" needs
 * assigneeId, "all" ignores assignment entirely (dashboard overview). */
async function listQueue({
  scope = "unassigned",
  assigneeId,
  status,
  search,
  skip,
  take,
} = {}) {
  const where = {};
  if (scope === "unassigned") where.assigneeId = null;
  else if (scope === "mine") where.assigneeId = assigneeId;

  if (status) where.status = status;
  else if (scope !== "all") where.status = { notIn: ["CLOSED"] };

  if (search) {
    where.OR = [
      { subject: { contains: search, mode: "insensitive" } },
      { ticketNumber: { contains: search, mode: "insensitive" } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      orderBy: [{ priority: "desc" }, { slaDueAt: "asc" }],
      skip,
      take,
    }),
    prisma.supportTicket.count({ where }),
  ]);
  return { items, total };
}

function addMessage(data) {
  return prisma.ticketMessage.create({ data });
}

/** Optimistic-lock assign: only succeeds if the ticket is still unassigned at `version`. */
async function assign({ id, version, assigneeId }) {
  const { count } = await prisma.supportTicket.updateMany({
    where: { id, version, assigneeId: null },
    data: { assigneeId, status: "ASSIGNED", version: { increment: 1 } },
  });
  return count > 0;
}

/** Optimistic-lock status transition. */
async function transitionStatus({ id, version, status, extra = {} }) {
  const { count } = await prisma.supportTicket.updateMany({
    where: { id, version },
    data: { status, version: { increment: 1 }, ...extra },
  });
  return count > 0;
}

module.exports = {
  create,
  findById,
  listByRequester,
  listQueue,
  addMessage,
  assign,
  transitionStatus,
};
