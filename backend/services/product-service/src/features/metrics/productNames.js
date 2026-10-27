const { Router } = require("express");
const { badRequest, requireInternalToken } = require("@reloop/shared");
const prisma = require("../../models/prismaClient");

// How many products one request may ask about, and how long an id may be.
const MAX_NAMES = 100;
const MAX_ID_LENGTH = 128;

/**
 * The names of products by id, for the Executive complaints page, which says
 * what a complaint is about. A listing that was sold keeps its row and its
 * name; one its seller deleted is only marked deleted (`deleted_at`), so its
 * name is still here. Both are returned, the deleted one flagged, so a
 * complaint about a product that has since been taken down still says which.
 * An id that was never a product is simply not in the answer.
 *
 * @param {string[]} ids
 * @returns {Promise<Array<{id: string, title: string, deleted: boolean}>>}
 */
async function getProductNames(ids, db = prisma) {
  const rows = await db.product.findMany({
    where: { id: { in: ids } },
    select: { id: true, title: true, deletedAt: true },
  });
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    deleted: row.deletedAt !== null,
  }));
}

const router = Router();

// Service-to-service only: called by auth-service with the internal token.
router.post("/product-names", requireInternalToken, async (req, res, next) => {
  try {
    const ids = req.body?.ids;
    if (
      !Array.isArray(ids) ||
      ids.length > MAX_NAMES ||
      ids.some(
        (id) => typeof id !== "string" || !id || id.length > MAX_ID_LENGTH,
      )
    ) {
      throw badRequest(
        `ids must be a list of at most ${MAX_NAMES} product ids`,
      );
    }
    res.json({ data: await getProductNames([...new Set(ids)]) });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
module.exports.getProductNames = getProductNames;
module.exports.MAX_NAMES = MAX_NAMES;
