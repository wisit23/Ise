const FILTER_FIELDS = ["category", "brand", "size", "condition"];

function parseCatalogFilters(input = {}) {
  const filters = {};
  for (const field of FILTER_FIELDS) {
    const value = input[field] === undefined ? "" : String(input[field]).trim();
    if (value) filters[field] = value;
  }
  if (input.style !== undefined) {
    const style = String(input.style).trim().toLowerCase();
    if (style) filters.style = style;
  }
  if (input.q !== undefined) {
    const q = String(input.q).trim();
    if (q) filters.q = q;
  }

  for (const field of ["minPrice", "maxPrice"]) {
    if (input[field] === undefined || String(input[field]).trim() === "")
      continue;
    const value = Number(String(input[field]).trim());
    if (!Number.isFinite(value) || value < 0)
      throw new Error(`${field} must be a non-negative number`);
    filters[field] = value;
  }
  if (
    filters.minPrice !== undefined &&
    filters.maxPrice !== undefined &&
    filters.minPrice > filters.maxPrice
  ) {
    throw new Error("minPrice must not be greater than maxPrice");
  }
  return filters;
}

/** One SQL predicate builder used for ranked and unranked catalog queries. */
function buildCatalogWhere(filters, { PrismaClient } = {}) {
  if (!PrismaClient) {
    // Kept lazy so validation/contract tests do not require generated Prisma files.
    ({ Prisma: PrismaClient } = require("../../generated/prisma-client"));
  }
  const clauses = [
    filters.status
      ? PrismaClient.sql`status = ${filters.status}`
      : PrismaClient.sql`status <> 'removed'`,
  ];
  for (const field of FILTER_FIELDS) {
    if (filters[field])
      clauses.push(
        PrismaClient.sql`AND ${PrismaClient.raw(field)} = ${filters[field]}`,
      );
  }
  if (filters.style)
    clauses.push(PrismaClient.sql`AND ${filters.style} = ANY(tags)`);
  if (filters.minPrice !== undefined)
    clauses.push(PrismaClient.sql`AND price >= ${filters.minPrice}`);
  if (filters.maxPrice !== undefined)
    clauses.push(PrismaClient.sql`AND price <= ${filters.maxPrice}`);
  if (filters.q)
    clauses.push(
      PrismaClient.sql`AND (search_text ILIKE '%' || ${filters.q} || '%' OR ${filters.q} <% search_text)`,
    );
  return PrismaClient.join(clauses, " ");
}

module.exports = { parseCatalogFilters, buildCatalogWhere };
