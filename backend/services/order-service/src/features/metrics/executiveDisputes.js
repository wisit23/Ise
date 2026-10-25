const { customerServicePolicy, escapeLike } = require("@reloop/shared");
const prisma = require("../../models/prismaClient");
const sellerNameSearch = require("./sellerNameSearch");

/**
 * Disputes for the Executive complaints page: a read-only list over a date
 * range with the filters that make sense for a dispute. A case's status,
 * priority and opening time live in its workflow state, which the model layer
 * exposes as plain fields, so the filters below are ordinary Prisma conditions.
 * Only what the page shows is returned: no evidence, no chat, no assignee.
 */

// The stages a dispute can be in (see disputeWorkflowClient / disputeService).
const DISPUTE_STATUSES = ["OPEN", "NEEDS_INFO", "DECIDED"];
// The case priorities from the shared policy, plus CRITICAL, which only an
// escalated dispute carries.
const DISPUTE_PRIORITIES = [
  ...Object.keys(customerServicePolicy.priorities),
  "CRITICAL",
];
// What a buyer can pick when opening one. The server accepts any text, so a
// case can carry another value; it is shown but not offered as a filter.
const DISPUTE_TYPES = [
  "ITEM_NOT_AS_DESCRIBED",
  "DAMAGED_ITEM",
  "WRONG_ITEM",
  "OTHER",
];

const toItem = (row) => ({
  id: row.id,
  ...(row.referenceCode ? { referenceCode: row.referenceCode } : {}),
  orderId: row.orderId,
  disputeType: row.disputeType,
  status: row.status,
  priority: row.priority,
  reason: row.reason,
  decision: row.decision ?? null,
  createdAt: row.createdAt.toISOString(),
});

/**
 * Cases opened in [from, to). `status`, `disputeType`, `priority` and `search` narrow
 * the list; `statusCounts` describe the same range and the same type/priority
 * but ignore the status filter, so each status chip can show how many it would
 * give.
 */
async function listExecutiveDisputes({
  from,
  to,
  status,
  disputeType,
  priority,
  search,
  sort = "newest",
  skip,
  take,
}) {
  // The case's code (DSP-…), its order's (ORD-…) or the name of the shop that
  // sold it, whole or in part. Shop names belong to auth-service, which finds
  // the sellers; here they are matched against the orders' sellers.
  const text = search?.replace(/^#/, "");
  const sellerIds = text ? await sellerNameSearch.findUserIds(text) : [];
  const like = text ? escapeLike(text) : undefined;
  const base = {
    createdAt: { gte: from, lt: to },
    ...(text
      ? {
          OR: [
            { referenceCode: { contains: like, mode: "insensitive" } },
            {
              order: {
                referenceCode: { contains: like, mode: "insensitive" },
              },
            },
            ...(sellerIds.length > 0
              ? [{ order: { sellerId: { in: sellerIds } } }]
              : []),
          ],
        }
      : {}),
    ...(disputeType ? { disputeType } : {}),
    ...(priority ? { priority } : {}),
  };
  const where = { ...base, ...(status ? { status } : {}) };

  const [rows, total, countRows] = await Promise.all([
    prisma.disputeCase.findMany({
      where,
      orderBy: [
        { createdAt: sort === "oldest" ? "asc" : "desc" },
        { id: "asc" },
      ],
      skip,
      take,
    }),
    prisma.disputeCase.count({ where }),
    Promise.all(
      DISPUTE_STATUSES.map((s) =>
        prisma.disputeCase.count({ where: { ...base, status: s } }),
      ),
    ),
  ]);

  return {
    items: rows.map(toItem),
    total,
    statusCounts: Object.fromEntries(
      DISPUTE_STATUSES.map((s, i) => [s, countRows[i]]),
    ),
  };
}

module.exports = {
  listExecutiveDisputes,
  DISPUTE_STATUSES,
  DISPUTE_PRIORITIES,
  DISPUTE_TYPES,
};
