const prisma = require("../../models/prismaClient");
const { Prisma } = require("../../generated/prisma-client");
const { toApiShape } = require("../../models/productModel");
const { RULES, explanation, repeatCapFor } = require("./recommendationRules");
const { buildCatalogWhere } = require("../catalog/catalogQuery");

// Personal slots are drawn at random, weighted by score (weighted sampling
// without replacement, Efraimidis-Spirakis: order by ln(u) / weight). The
// uniform draw u comes from md5(id + seed), so one seed keeps every page of a
// browsing session in a single fixed order. The floor gives zero-score items a
// small chance instead of none.
const PERSONAL_WEIGHT_FLOOR = 0.5;

function createRecommendationRepository(db, sql = Prisma) {
  function oneOf(expression, values) {
    return values.length
      ? sql.sql`${expression} IN (${sql.join(values)})`
      : sql.sql`FALSE`;
  }

  // Include both the legacy display category and all category memberships.
  function categoryMatch(values) {
    if (!values.length) return sql.sql`FALSE`;
    return sql.sql`(${oneOf(sql.sql`lower(btrim(products.category))`, values)} OR EXISTS (
      SELECT 1 FROM product_categories pc JOIN categories c ON c.id = pc.category_id
      WHERE pc.product_id = products.id AND pc.deleted_at IS NULL AND ${oneOf(sql.sql`lower(btrim(c.name))`, values)}
    ))`;
  }

  function styleMatch(styles) {
    return styles.length
      ? sql.sql`EXISTS (
      SELECT 1 FROM unnest(products.tags) tag WHERE ${oneOf(sql.sql`lower(btrim(tag))`, styles)}
    )`
      : sql.sql`FALSE`;
  }

  function similarityScore(signal) {
    // A generic shared style is weaker evidence than category plus brand.
    return sql.sql`${signal.weight}::double precision * (
      CASE WHEN (${categoryMatch(signal.profile.categories)}) THEN 0.5 ELSE 0 END +
      CASE WHEN (${oneOf(sql.sql`lower(btrim(products.brand))`, signal.profile.brands)}) THEN 0.3 ELSE 0 END +
      CASE WHEN (${styleMatch(signal.profile.styles)}) THEN 0.2 ELSE 0 END
    )`;
  }

  // Search keeps its single best match. Activity signals accumulate, so
  // repeating the same kind of purchase, like or view raises the score, up to
  // the rule's repeat cap.
  function behaviorScore(signals, value, cap) {
    if (!signals.length) return sql.sql`0::double precision`;
    const values = signals.map((signal) => value(signal));
    return cap === undefined
      ? sql.sql`GREATEST(${sql.join(values)})`
      : sql.sql`LEAST(${sql.join(values, " + ")}, ${cap}::double precision)`;
  }

  async function list({
    profile,
    userId,
    skip,
    take,
    filters = {},
    behavior = {},
    seed,
  }) {
    const matches = {
      category: categoryMatch(profile.categories),
      style: styleMatch(profile.styles),
      brand: oneOf(sql.sql`lower(btrim(products.brand))`, profile.brands),
      size: profile.sizes.length
        ? sql.join(
            profile.sizes.map(
              (group) =>
                sql.sql`(${categoryMatch([group.category])} AND ${oneOf(sql.sql`lower(btrim(products.size))`, group.values)})`,
            ),
            " OR ",
          )
        : sql.sql`FALSE`,
      search: behaviorScore(
        behavior.searches || [],
        (signal) =>
          sql.sql`CASE WHEN (${sql.join(
            signal.query
              .split(/\s+/u)
              .filter(Boolean)
              .map(
                (token) =>
                  sql.sql`strpos(lower(products.search_text), ${token}) > 0`,
              ),
            " AND ",
          )}) THEN ${signal.weight}::double precision ELSE 0 END`,
      ),
      like: behaviorScore(
        behavior.likes || [],
        similarityScore,
        repeatCapFor("like"),
      ),
      productView: behaviorScore(
        behavior.productViews || [],
        similarityScore,
        repeatCapFor("productView"),
      ),
      videoView: behaviorScore(
        behavior.videoViews || [],
        similarityScore,
        repeatCapFor("videoView"),
      ),
      purchase: behaviorScore(
        behavior.purchases || [],
        similarityScore,
        repeatCapFor("purchase"),
      ),
    };
    const score = sql.join(
      RULES.map(({ key, weight, behavioral }) =>
        behavioral
          ? matches[key]
          : sql.sql`CASE WHEN (${matches[key]}) THEN ${weight} ELSE 0 END`,
      ),
      " + ",
    );
    const where = sql.sql`${buildCatalogWhere({ ...filters, status: "available" }, { PrismaClient: sql })}
      ${userId ? sql.sql`AND products.seller_id <> ${userId}` : sql.sql``}`;
    const searchOrder = filters.q
      ? sql.sql`ts_rank_cd(search_vector, plainto_tsquery('simple', ${filters.q})) DESC,
      GREATEST(word_similarity(${filters.q}, search_text), similarity(${filters.q}, search_text)) DESC,`
      : sql.sql``;

    const selection = sql.sql`SELECT products.id, products.created_at, (${score}) AS score,
        (${matches.category}) AS category, (${matches.style}) AS style,
        (${matches.brand}) AS brand, (${matches.size}) AS size,
        (${matches.search}) AS search, (${matches.like}) AS "like", (${matches.purchase}) AS purchase,
        (${matches.productView}) AS "productView", (${matches.videoView}) AS "videoView"
        FROM products WHERE ${where}`;
    // A seed lasts for one browsing session, including all its pages. Allocate
    // disjoint pools first, then interleave them; independent page shuffles
    // would repeat products and omit others across pagination.
    const mixed = seed && !filters.q;
    const pageQuery = mixed
      ? sql.sql`
      WITH eligible AS (${selection}),
      fresh AS (
        SELECT *, row_number() OVER (ORDER BY created_at DESC, id ASC) AS freshness,
          round(count(*) OVER () * 0.15)::int AS new_count,
          (count(*) OVER () - round(count(*) OVER () * 0.70) - round(count(*) OVER () * 0.15))::int AS discovery_count
        FROM eligible
      ), new_pool AS (
        SELECT *, row_number() OVER (ORDER BY
          CASE WHEN freshness <= GREATEST(new_count * 3, new_count) THEN 0 ELSE 1 END,
          md5(id || ${seed} || 'new'), id) AS new_rank
        FROM fresh
      ), discovery_pool AS (
        SELECT *, row_number() OVER (ORDER BY
          CASE WHEN new_rank <= new_count THEN 1 ELSE 0 END,
          md5(id || ${seed} || 'discover'), id) AS discovery_rank
        FROM new_pool
      ), grouped AS (
        SELECT *, CASE WHEN new_rank <= new_count THEN 'new'
          WHEN discovery_rank <= discovery_count THEN 'discovery'
          ELSE 'personal' END AS bucket
        FROM discovery_pool
      ), positioned AS (
        SELECT *, row_number() OVER (PARTITION BY bucket ORDER BY
          CASE WHEN bucket = 'personal' THEN ln(
            ((('x' || substr(md5(id || ${seed} || 'pick'), 1, 13))::bit(52)::bigint + 1)::double precision / 4503599627370496)
          ) / (score + ${PERSONAL_WEIGHT_FLOOR}::double precision) ELSE 0 END DESC,
          CASE WHEN bucket = 'new' THEN new_rank WHEN bucket = 'discovery' THEN discovery_rank ELSE 0 END,
          created_at DESC, id ASC) AS bucket_position
        FROM grouped
      ) SELECT * FROM positioned
      -- Bring rotating slots into the visible first row while keeping the
      -- same disjoint 70/15/15 pools and stable pagination for this seed.
      ORDER BY (bucket_position::double precision - CASE bucket WHEN 'new' THEN 0.75 WHEN 'discovery' THEN 0.50 ELSE 0 END)
        / CASE WHEN bucket = 'personal' THEN 70 ELSE 15 END,
        CASE bucket WHEN 'personal' THEN 0 WHEN 'new' THEN 1 ELSE 2 END, id
      LIMIT ${take} OFFSET ${skip}`
      : sql.sql`SELECT products.id, (${score}) AS score,
        (${matches.category}) AS category, (${matches.style}) AS style,
        (${matches.brand}) AS brand, (${matches.size}) AS size,
        (${matches.search}) AS search, (${matches.like}) AS "like", (${matches.purchase}) AS purchase,
        (${matches.productView}) AS "productView", (${matches.videoView}) AS "videoView"
        FROM products WHERE ${where}
        ORDER BY ${searchOrder} score DESC, products.created_at DESC, products.id ASC LIMIT ${take} OFFSET ${skip}`;

    // Rank the entire eligible catalog in SQL before paginating; older exact
    // matches must not disappear behind an arbitrary recent-candidate limit.
    const [rows, counts] = await Promise.all([
      db.$queryRaw(pageQuery),
      db.$queryRaw(sql.sql`SELECT count(*)::int AS total,
        count(*) FILTER (WHERE (${score}) > 0)::int AS matched_total
        FROM products WHERE ${where}`),
    ]);
    const products = rows.length
      ? await db.product.findMany({
          // Recheck eligibility: a product may be sold/moderated after ranking.
          where: {
            deletedAt: null,
            id: { in: rows.map((row) => row.id) },
            status: "available",
            moderatedAt: null,
            ...(userId ? { sellerId: { not: userId } } : {}),
          },
          include: {
            photos: { where: { deletedAt: null } },
            videos: { where: { deletedAt: null } },
            categoryLinks: {
              where: { deletedAt: null },
              include: { category: true },
            },
          },
        })
      : [];
    const byId = new Map(products.map((product) => [product.id, product]));
    return {
      items: rows
        .filter((row) => byId.has(row.id))
        .map((row) => ({
          ...toApiShape(byId.get(row.id)),
          recommendation: {
            ...explanation(row),
            ...(mixed ? { bucket: row.bucket } : {}),
          },
        })),
      total: counts[0]?.total || 0,
      matchedTotal: counts[0]?.matched_total || 0,
    };
  }
  return { list };
}

module.exports = createRecommendationRepository(prisma);
module.exports.createRecommendationRepository = createRecommendationRepository;
