const { badRequest } = require("@reloop/shared");
const prisma = require("../../models/prismaClient");
async function awaitingReply(req, res, next, db = prisma) {
  try {
    const { ids, contextTypes } = req.body;
    if (
      !Array.isArray(ids) ||
      ids.length > 200 ||
      ids.some((id) => typeof id !== "string" || !id || id.length > 128) ||
      !Array.isArray(contextTypes) ||
      !contextTypes.length ||
      contextTypes.some(
        (type) =>
          !["SUPPORT", "DISPUTE_BUYER", "DISPUTE_SELLER"].includes(type),
      )
    )
      throw badRequest("Invalid reply summary request");
    const rows = await db.conversation.aggregateRaw({
      pipeline: [
        {
          $match: {
            contextId: { $in: ids },
            contextType: { $in: contextTypes },
            status: "ACTIVE",
          },
        },
        {
          $lookup: {
            from: "Message",
            let: { room: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$conversationId", "$$room"] },
                  visibility: "ALL",
                  deletedAt: null,
                  senderRole: {
                    $in: ["BUYER", "SELLER", "REQUESTER", "AGENT", "ADMIN"],
                  },
                  type: { $ne: "SYSTEM" },
                },
              },
              { $sort: { createdAt: -1, _id: -1 } },
              { $limit: 1 },
            ],
            as: "lastPublic",
          },
        },
        {
          $match: {
            "lastPublic.0.senderRole": {
              $in: ["BUYER", "SELLER", "REQUESTER"],
            },
          },
        },
        { $project: { _id: 0, contextId: 1 } },
      ],
    });
    res.json({ ids: [...new Set(rows.map((row) => row.contextId))] });
  } catch (error) {
    next(error);
  }
}
module.exports = { awaitingReply };
