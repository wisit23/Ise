const db = require("../../models/prismaClient");
const { Prisma } = require("../../generated/prisma-client");
module.exports = require("@reloop/shared/src/csat").createCsat({
  db,
  Prisma,
  async readCase(tx, id) {
    const [row] = await tx.$queryRaw(Prisma.sql`
      SELECT d.status, d.deleted_at, d.decided_at, d.assigned_role, d.assigned_to, o.buyer_id, o.seller_id
      FROM dispute_case d JOIN orders o ON o.order_id = d.order_id
      WHERE d.dispute_case_id = ${id} FOR UPDATE OF d`);
    if (!row) return null;
    const logs = await tx.disputeCaseLog.findMany({
      where: {
        disputeCaseId: id,
        toAssignedTo: { not: null },
        ...(row.decided_at ? { createdAt: { lte: row.decided_at } } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    const agentId =
      logs.find((log) => log.toAssignedRole === "CUSTOMER_SERVICE")
        ?.toAssignedTo ??
      (row.assigned_role === "CUSTOMER_SERVICE" ? row.assigned_to : null);
    return {
      participants: { [row.buyer_id]: "BUYER", [row.seller_id]: "SELLER" },
      deleted: Boolean(row.deleted_at),
      complete: row.status === "DECIDED",
      agentId,
    };
  },
});
