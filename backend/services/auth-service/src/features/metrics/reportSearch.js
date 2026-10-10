const { Prisma } = require("@prisma/client");

/** One parameterized predicate shared by the result page and its total count. */
function reportPredicate(
  { status, targetId, search, reasonCategory },
  { openStatuses, categoryKeywords },
) {
  const statuses = status ? [status] : openStatuses;
  const clauses = [
    status === "ALL"
      ? Prisma.sql`TRUE`
      : Prisma.sql`r.status::text IN (${Prisma.join(statuses)})`,
  ];
  if (targetId) clauses.push(Prisma.sql`r.target_id = ${targetId}`);
  if (search) {
    // STRPOS treats % and _ as literal text, not user-controlled wildcards.
    clauses.push(Prisma.sql`(
      strpos(lower(COALESCE(r.target_id, '')), lower(${search})) > 0
      OR EXISTS (
        SELECT 1 FROM users u
        LEFT JOIN seller_profiles s ON s.user_id = u.id
        WHERE u.id = r.target_id AND (
          strpos(lower(COALESCE(s.shop_name, '')), lower(${search})) > 0
          OR strpos(lower(concat_ws(' ', u.f_name, u.l_name)), lower(${search})) > 0
        )
      )
    )`);
  }
  const keywords = categoryKeywords[reasonCategory];
  if (keywords) {
    clauses.push(
      Prisma.sql`(${Prisma.join(
        keywords.map(
          (word) => Prisma.sql`strpos(lower(r.reason), lower(${word})) > 0`,
        ),
        " OR ",
      )})`,
    );
  }
  return Prisma.join(clauses, " AND ");
}

async function findReportPage(prisma, filters, definitions) {
  const { page, limit, sortBy } = filters;
  const predicate = reportPredicate(filters, definitions);
  const order =
    sortBy === "most_reported"
      ? Prisma.sql`COALESCE(counts.report_count, 1) DESC, r.reported_at DESC, r.id DESC`
      : sortBy === "oldest"
        ? Prisma.sql`r.reported_at ASC, r.id ASC`
        : Prisma.sql`r.reported_at DESC, r.id DESC`;
  const countJoin =
    sortBy === "most_reported"
      ? Prisma.sql`LEFT JOIN (
        SELECT target_id, count(*) AS report_count FROM reports GROUP BY target_id
      ) counts ON counts.target_id = r.target_id`
      : Prisma.empty;

  // Rows and their pagination count must describe the same DB snapshot.
  return prisma.$transaction(
    async (tx) => {
      const [ids, totals] = await Promise.all([
        tx.$queryRaw`
      SELECT r.id FROM reports r
      ${countJoin}
      WHERE ${predicate}
      ORDER BY ${order}
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
