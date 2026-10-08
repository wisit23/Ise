require("dotenv").config();
const prisma = require("../src/models/prismaClient");
const tickets = require("../src/features/tickets/ticketModel");
const chat = require("../src/services/chatClient");

// Rerunnable, bounded, non-destructive. Run while old CS writers are stopped.
async function migrate({ apply = false, db = prisma, ticketModel = tickets, chatClient = chat } = {}) {
  let cursor;
  let verified = 0;
  let pending = 0;
  for (;;) {
    const rows = await db.ticketMessage.findMany({ orderBy: { id: "asc" }, take: 100,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), include: { ticket: { include: { chatLink: true } } } });
    if (!rows.length) break;
    for (const row of rows) {
      if (!apply) { pending++; continue; }
      let conversationId = row.ticket.chatLink?.conversationId;
      if (!conversationId) {
        const conversation = await chatClient.createSupportConversation(row.ticketId, row.ticket.ticketNumber, row.ticket.requesterId);
        conversationId = conversation.id;
        await ticketModel.setConversationId(row.ticketId, conversationId);
      }
      const imported = await chatClient.importTicketMessage(conversationId, {
        sourceId: row.id, ticketId: row.ticketId, chatMessageId: row.chatMessageId,
        authorId: row.authorId, authorRole: row.authorRole, body: row.body,
        isInternal: row.isInternal, createdAt: row.createdAt,
      });
      await ticketModel.recordChatMessage({ ticketId: row.ticketId, conversationId,
        chatMessageId: imported.id, authorId: imported.senderId, authorRole: imported.senderRole,
        isInternal: imported.visibility === "INTERNAL", createdAt: imported.createdAt });
      // Keep legacy archive immutable. The deterministic source ID makes retries safe.
      verified++;
    }
    cursor = rows[rows.length - 1].id;
  }
  return { verified, pending, archiveDeleted: false };
}

if (require.main === module) {
  migrate({ apply: process.argv.includes("--apply") })
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => { console.error(error.message); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}
module.exports = { migrate };
