const { Prisma } = require("@prisma/client");

/** One parameterized predicate shared by the result page and its total count. */
function reportPredicate({ range, status, openStatuses }) {
  const clauses = [
    status === "ALL"
      ? Prisma.sql`TRUE`
      : Prisma.sql`r.status::text IN (${Prisma.join(status ? [status] : openStatuses)})`,
  ];
  if (range) {
    clauses.push(
      Prisma.sql`r.reported_at >= ${range.from} AND r.reported_at < ${range.to}`,
    );
  }
  return Prisma.join(clauses, " AND ");
}

/**
 * One page of complaints, newest first, and how many match in all. The rows
 * and the total are read in one repeatable-read transaction so they describe
 * the same snapshot.
 */
async function findReportPage(prisma, { page, limit, ...filters }) {
  const predicate = reportPredicate(filters);
  return prisma.$transaction(
    async (tx) => {
      const [ids, totals] = await Promise.all([
        tx.$queryRaw`
          SELECT r.id FROM reports r
          WHERE ${predicate}
          ORDER BY r.reported_at DESC, r.id DESC
          LIMIT ${limit} OFFSET ${(page - 1) * limit}
        `,
        tx.$queryRaw`SELECT count(*)::int AS total FROM reports r WHERE ${predicate}`,
      ]);
      const rows = await tx.report.findMany({
        where: { id: { in: ids.map((row) => row.id) } },
        include: { reporter: { select: { firstName: true, lastName: true } } },
      });
      const byId = new Map(rows.map((row) => [row.id, row]));
      return {
        reports: ids.map((row) => byId.get(row.id)).filter(Boolean),
        total: totals[0].total,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}

module.exports = { findReportPage };
