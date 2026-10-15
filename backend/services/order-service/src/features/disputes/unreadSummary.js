const { forbidden, effectiveStaffRole } = require("@reloop/shared");
const prisma = require("../../models/prismaClient");
const { readCaseUnread } = require("@reloop/shared/src/caseUnread");

async function unreadSummary(req, res, next) {
  try {
    const role = effectiveStaffRole(req);
    if (!["CUSTOMER_SERVICE", "TRUST_AND_SAFETY", "ADMIN"].includes(role))
      throw forbidden("Only support staff can read unread summaries");
    const rows = await prisma.disputeCase.findMany({
      where: {
        status: { in: ["OPEN", "NEEDS_INFO"] },
        archivedAt: null,
        deletedAt: null,
        ...(role === "CUSTOMER_SERVICE"
          ? {
              AND: [
                {
                  OR: [
                    { assignedRole: null },
                    { assignedRole: "CUSTOMER_SERVICE" },
                  ],
                },
                { OR: [{ assignedTo: null }, { assignedTo: req.userId }] },
              ],
            }
          : {}),
      },
      select: { id: true, assignedTo: true },
    });
    res.set("Cache-Control", "private, no-store");
    res.json(
      await readCaseUnread(
        rows.map((row) => ({ id: row.id, assigneeId: row.assignedTo })),
        req.userId,
        "disputes",
      ),
    );
  } catch (err) {
    next(err);
  }
}
module.exports = { unreadSummary };
