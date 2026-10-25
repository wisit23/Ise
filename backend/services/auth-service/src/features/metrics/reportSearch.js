const { Prisma } = require("@prisma/client");

/** One parameterized predicate shared by the result page and its total count. */
function reportPredicate({ range, status, search, targetId, openStatuses }) {
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
  if (targetId) clauses.push(Prisma.sql`r.target_id = ${targetId}`);
  if (search) {
    // Its own code (RPT-…), or who it is about: their code (USR-…), shop name
    // or name. strpos reads the text literally, so %, _ and \ in what was typed
    // are ordinary characters, not patterns.
    clauses.push(Prisma.sql`(
      strpos(lower(COALESCE(r.reference_code, '')), lower(${search})) > 0
      OR EXISTS (
        SELECT 1 FROM users u
        LEFT JOIN seller_profiles s ON s.user_id = u.id
        WHERE u.id = r.target_id AND (
          strpos(lower(COALESCE(u.reference_code, '')), lower(${search})) > 0
          OR strpos(lower(COALESCE(s.shop_name, '')), lower(${search})) > 0
          OR strpos(lower(concat_ws(' ', u.f_name, u.l_name)), lower(${search})) > 0
        )
      )
    )`);
  }
  return Prisma.join(clauses, " AND ");
}

/**
 * Count reports grouped by status under the given range, search and targetId filters.
 * The status filter itself is omitted (evaluated as ALL) so each status chip reflects
 * how many reports would match if that status were selected.
 */
async function countReportStatuses(prisma, { range, search, targetId }) {
  const predicate = reportPredicate({ range, status: "ALL", search, targetId });
  const rows = await prisma.$queryRaw`
    SELECT r.status, count(*)::int AS total
    FROM reports r
    WHERE ${predicate}
    GROUP BY r.status
  `;
  return rows.map((r) => ({ status: r.status, count: r.total }));
}

/**
 * One page of complaints, newest first, and how many match in all. The rows
 * and the total are read in one repeatable-read transaction so they describe
 * the same snapshot.
 */
async function findReportPage(prisma, { page, limit, sort, ...filters }) {
  const predicate = reportPredicate(filters);
  // By when it was reported; the id breaks ties so a page never repeats a row.
  const order =
    sort === "oldest"
      ? Prisma.sql`r.reported_at ASC, r.id ASC`
      : Prisma.sql`r.reported_at DESC, r.id DESC`;
  return prisma.$transaction(
    async (tx) => {
      const [ids, totals, statusGroups] = await Promise.all([
        tx.$queryRaw`
          SELECT r.id FROM reports r
          WHERE ${predicate}
          ORDER BY ${order}
          LIMIT ${limit} OFFSET ${(page - 1) * limit}
        `,
        tx.$queryRaw`SELECT count(*)::int AS total FROM reports r WHERE ${predicate}`,
        countReportStatuses(tx, filters),
      ]);
      const rows = await tx.report.findMany({
        where: { id: { in: ids.map((row) => row.id) } },
        include: { reporter: { select: { firstName: true, lastName: true } } },
      });
      const byId = new Map(rows.map((row) => [row.id, row]));
      return {
        reports: ids.map((row) => byId.get(row.id)).filter(Boolean),
        total: totals[0].total,
        statusGroups,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}

module.exports = { findReportPage, countReportStatuses };
