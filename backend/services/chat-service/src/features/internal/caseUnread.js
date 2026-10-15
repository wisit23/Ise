const { badRequest } = require("@reloop/shared");
const prisma = require("../../models/prismaClient");

async function caseUnread(req, res, next, db = prisma) {
  try {
    const { ids, contextTypes, userId } = req.body || {};
    if (
      !Array.isArray(ids) ||
      ids.length > 200 ||
      ids.some((id) => typeof id !== "string" || !id || id.length > 128) ||
      typeof userId !== "string" ||
      !userId ||
      userId.length > 128 ||
      !Array.isArray(contextTypes) ||
      !contextTypes.length ||
      contextTypes.some(
        (type) =>
          !["SUPPORT", "DISPUTE_BUYER", "DISPUTE_SELLER"].includes(type),
      )
    )
      throw badRequest("Invalid unread summary request");
    // The calling case-owner service supplies only cases this staff member
    // may inspect. Never add participants merely to compute queue badges.
    const rows = await db.conversation.aggregateRaw({
      pipeline: [
        {
          $match: {
            contextId: { $in: ids },
            contextType: { $in: contextTypes },
          },
        },
        {
          $set: {
            reader: {
              $arrayElemAt: [
                {
                  $filter: {
                    input: "$participants",
                    as: "p",
                    cond: { $eq: ["$$p.userId", userId] },
                  },
                },
                0,
              ],
            },
          },
        },
        {
          $lookup: {
            from: "Message",
            let: {
              room: "$_id",
              since: { $ifNull: ["$reader.lastReadAt", "$createdAt"] },
            },
            pipeline: [
              {
                $match: {
                  visibility: "ALL",
                  deletedAt: null,
                  type: { $ne: "SYSTEM" },
                  senderRole: { $in: ["BUYER", "SELLER", "REQUESTER"] },
                  senderId: { $ne: userId },
                  $expr: {
                    $and: [
                      { $eq: ["$conversationId", "$$room"] },
                      { $gt: ["$createdAt", "$$since"] },
                    ],
                  },
                },
              },
              { $count: "total" },
            ],
            as: "unread",
          },
        },
        {
          $group: {
            _id: "$contextId",
            count: {
              $sum: { $ifNull: [{ $arrayElemAt: ["$unread.total", 0] }, 0] },
            },
          },
        },
        { $project: { _id: 0, id: "$_id", count: 1 } },
      ],
    });
    res.json({ items: rows });
  } catch (err) {
    next(err);
  }
}

module.exports = { caseUnread };
