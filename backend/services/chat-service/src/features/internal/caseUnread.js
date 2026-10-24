const prisma = require("../../models/prismaClient");
const internalService = require("./internalService");

// HTTP layer only — the query lives in internalService.caseUnreadCounts.
async function caseUnread(req, res, next, db = prisma) {
  try {
    res.json({ items: await internalService.caseUnreadCounts(req.body, db) });
  } catch (err) {
    next(err);
  }
}

module.exports = { caseUnread };
