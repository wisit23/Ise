require("dotenv").config();
const { randomUUID } = require("node:crypto");
const prisma = require("../src/models/prismaClient");
const chat = require("../src/services/chatClient");
const { Prisma } = require("../src/generated/prisma-client");

// Raw SQL intentionally reads the pre-contract archive, independently of the generated
// post-contract client. Stop old writers; deploy Chat import API before running --apply.
const fingerprint = Prisma.sql`md5(jsonb_build_object(
  'id',m.id,'ticketId',m.ticket_id,'authorId',m.author_id,'authorRole',m.author_role,
  'body',m.body,'isInternal',m.is_internal,'chatMessageId',m.chat_message_id,
  'createdAt',to_char(m.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))::text)`;

async function migrate({ apply = false, db = prisma, chatClient = chat } = {}) {
  const [{ archive, contracted }] = await db.$queryRaw`
    SELECT to_regclass('public.ticket_messages')::text AS archive,
      EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
        AND table_name='support_tickets' AND column_name='ticket_id') AS contracted`;
  if (!archive) return { verified: 0, pending: 0, archiveDeleted: true };
  if (contracted) throw new Error("Unexpected archive after contract migration; inspect migration state");
  let cursor = "", verified = 0, pending = 0;
  for (;;) {
    const rows = await db.$queryRaw`
      SELECT m.id,m.ticket_id AS "ticketId",m.author_id AS "authorId",m.author_role AS "authorRole",
        m.body,m.is_internal AS "isInternal",m.chat_message_id AS "chatMessageId",m.created_at AS "createdAt",
        t.ticket_number AS "ticketNumber",t.requester_id AS "requesterId",l.conversation_id AS "conversationId",
        ${fingerprint} AS fingerprint
      FROM ticket_messages m JOIN support_tickets t ON t.id=m.ticket_id
      LEFT JOIN ticket_chat_links l ON l.ticket_id=m.ticket_id
      WHERE m.id > ${cursor} ORDER BY m.id LIMIT 100`;
    if (!rows.length) break;
    for (const row of rows) {
      if (!apply) { pending++; continue; }
      let conversationId = row.conversationId;
      if (!conversationId) {
        const conversation = await chatClient.createSupportConversation(row.ticketId, row.ticketNumber, row.requesterId);
        if (!conversation?.id) throw new Error("Chat returned no conversation");
        conversationId = conversation.id;
        await db.$executeRaw`INSERT INTO ticket_chat_links(ticket_id,conversation_id)
          VALUES (${row.ticketId},${conversationId}) ON CONFLICT(ticket_id) DO NOTHING`;
        const [link] = await db.$queryRaw`SELECT conversation_id FROM ticket_chat_links WHERE ticket_id=${row.ticketId}`;
        if (link?.conversation_id !== conversationId) throw new Error("Ticket conversation ownership mismatch");
      }
      const imported = await chatClient.importTicketMessage(conversationId, {
        sourceId: row.id, ticketId: row.ticketId, chatMessageId: row.chatMessageId,
        authorId: row.authorId, authorRole: row.authorRole, body: row.body,
        isInternal: row.isInternal, createdAt: row.createdAt,
      });
      const role = row.authorRole === "REQUESTER" ? "BUYER" : row.authorRole;
      const roleMatches = imported?.senderRole === role || (row.chatMessageId &&
        ["AGENT", "REQUESTER"].includes(row.authorRole) && ["AGENT", "ADMIN", "TRUST_AND_SAFETY", "CUSTOMER_SERVICE"].includes(imported?.senderRole));
      if (!imported?.id || imported.conversationId !== conversationId || imported.senderId !== row.authorId ||
        !roleMatches || imported.visibility !== (row.isInternal ? "INTERNAL" : "ALL") ||
        (!row.chatMessageId && (imported.body !== row.body || +new Date(imported.createdAt) !== +row.createdAt)))
        throw new Error(`Chat verification failed for legacy message ${row.id}`);
      // A matching Chat ID represents the authoritative original (including edited/attachment
      // content), not the potentially stale Support text mirror. Never synthesize missing originals.
      const payload = JSON.stringify({ schemaVersion: 1, legacyMessageId: row.id,
        legacyFingerprint: row.fingerprint, conversationId, chatMessageId: imported.id,
        verifiedAt: new Date().toISOString(), originalChatMessage: Boolean(row.chatMessageId) });
      await db.$transaction(async tx => {
        const [source] = await tx.$queryRaw`SELECT ${fingerprint} AS fingerprint FROM ticket_messages m WHERE m.id=${row.id} FOR UPDATE`;
        if (source?.fingerprint !== row.fingerprint) throw new Error("Legacy message changed during import; stop old writers and retry");
        await tx.$executeRaw`INSERT INTO ticket_audit_events(id,ticket_id,actor_id,event_type,dedupe_key,payload)
          VALUES (${randomUUID()},${row.ticketId},'migration:chat','MESSAGE_MIGRATED',${"legacy-chat:" + row.id},${payload}::jsonb)
          ON CONFLICT(dedupe_key) DO UPDATE SET payload=EXCLUDED.payload,created_at=CURRENT_TIMESTAMP`;
      });
      verified++;
    }
    cursor = rows[rows.length - 1].id;
  }
  return { verified, pending, archiveDeleted: false };
}
if (require.main === module) {
  migrate({ apply: process.argv.includes("--apply") })
    .then(result => console.log(JSON.stringify(result)))
    .catch(error => { console.error(error.message); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}
module.exports = { migrate, fingerprint };
