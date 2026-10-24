const prisma = require("../../models/prismaClient");
const internalService = require("./internalService");

// HTTP layer only — the query lives in internalService.awaitingReplyIds.
async function awaitingReply(req, res, next, db = prisma) {
  try {
    res.json({ ids: await internalService.awaitingReplyIds(req.body, db) });
  } catch (error) {
    next(error);
  }
}
module.exports = { awaitingReply };
