const { badRequest, escapeLike, searchQuery } = require("@reloop/shared");
const prisma = require("../../models/prismaClient");

const PAGE_SIZE = 100;

async function searchSellers(req, res, next) {
  try {
    const query = searchQuery(req.body?.q);
    const cursor = req.body?.cursor;
    if (!query) throw badRequest("q is required");
    if (
      cursor !== undefined &&
      (typeof cursor !== "string" || !cursor || cursor.length > 200)
    ) {
      throw badRequest("cursor must be a non-empty user id");
    }
    const text = escapeLike(query);
    const rows = await prisma.user.findMany({
      where: {
        ...(cursor ? { id: { gt: cursor } } : {}),
        sellerProfile: { isNot: null },
        OR: [
          { firstName: { contains: text, mode: "insensitive" } },
          { lastName: { contains: text, mode: "insensitive" } },
          {
            sellerProfile: {
              shopName: { contains: text, mode: "insensitive" },
            },
          },
        ],
      },
      select: { id: true },
      orderBy: { id: "asc" },
      take: PAGE_SIZE + 1,
    });
    const items = rows.slice(0, PAGE_SIZE);
    res.json({
      sellerIds: items.map((row) => row.id),
      nextCursor: rows.length > PAGE_SIZE ? items.at(-1).id : null,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { searchSellers };
