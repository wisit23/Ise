// Add clearly labelled preview messages only to this existing local demo case.
const { PrismaClient } = require('./src/generated/prisma-client');
const prisma = new PrismaClient();
const disputeId = process.argv[2] || 'ba7c3f31-0f00-48ae-99b4-1c242d337fff';
if (!['ba7c3f31-0f00-48ae-99b4-1c242d337fff', '915c364c-9358-47bf-a4de-a601d93a9af1'].includes(disputeId)) throw new Error('Only verified demo cases are allowed');

async function main() {
  const url = new URL(process.env.DATABASE_URL);
  if (!['mongo', 'localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Local database only');
  for (const side of ['BUYER', 'SELLER']) {
    const room = await prisma.conversation.upsert({
      where: { contextKey: `DISPUTE_${side}:${disputeId}` },
      update: {},
      create: {
        contextKey: `DISPUTE_${side}:${disputeId}`, contextType: `DISPUTE_${side}`, contextId: disputeId,
        createdBy: '20000000-0000-0000-0000-000000000001',
        participants: [
          { userId: side === 'BUYER' ? '30000000-0000-0000-0000-000000000001' : '10000000-0000-0000-0000-000000000001', role: side, joinedAt: new Date() },
          { userId: '20000000-0000-0000-0000-000000000001', role: 'AGENT', joinedAt: new Date() },
        ],
      },
    });
    const party = room?.participants.find((p) => p.role === side && p.userId === (side === 'BUYER' ? '30000000-0000-0000-0000-000000000001' : '10000000-0000-0000-0000-000000000001'));
    const agent = room?.participants.find((p) => p.role === 'AGENT');
    if (!party || !agent) throw new Error(`Expected demo participants missing: ${side}`);
    const messages = [
      ['SYSTEM', 'system', 'เริ่มบทสนทนาตัวอย่างสำหรับดูหน้าตาแชท', '2026-10-15T09:00:00Z'],
      [side, party.userId, side === 'BUYER' ? 'สวัสดีครับ สินค้าที่ได้รับมีตะเข็บชำรุด ต้องดำเนินการอย่างไรครับ' : 'สวัสดีครับ ทางร้านพร้อมชี้แจงเรื่องสินค้าที่ลูกค้าแจ้งครับ', '2026-10-15T09:00:12Z'],
      ['AGENT', agent.userId, 'สวัสดีค่ะ เจ้าหน้าที่รับเรื่องแล้ว ขอรายละเอียดเพิ่มเติมเพื่อตรวจสอบนะคะ', '2026-10-15T09:01:05Z'],
      [side, party.userId, side === 'BUYER' ? 'พบรอยขาดบริเวณแขนเสื้อครับ\nกล่องพัสดุภายนอกยังอยู่ในสภาพปกติ' : 'ก่อนจัดส่งได้ตรวจสินค้าและถ่ายรูปไว้แล้วครับ สามารถส่งหลักฐานให้ตรวจสอบได้', '2026-10-16T03:10:24Z'],
      ['AGENT', agent.userId, 'ขอบคุณสำหรับข้อมูลค่ะ จะเปรียบเทียบหลักฐานทั้งสองฝ่ายและแจ้งผลในเคสนี้ค่ะ', '2026-10-16T03:12:36Z'],
      ['SYSTEM', 'system', 'สิ้นสุดข้อความตัวอย่าง — ใช้สำหรับดูรูปแบบแชทเท่านั้น', '2026-10-16T03:13:00Z'],
    ];
    for (const [index, [senderRole, senderId, body, createdAt]] of messages.entries()) {
      await prisma.message.upsert({
        where: { idempotencyKey: `audit-layout-preview-v1:${disputeId}:${side}:${index}` },
        update: { deletedAt: null },
        create: { conversationId: room.id, senderId, senderRole, type: senderRole === 'SYSTEM' ? 'SYSTEM' : 'TEXT', body: `[ตัวอย่าง] ${body}`, deletedAt: null, createdAt: new Date(createdAt), idempotencyKey: `audit-layout-preview-v1:${disputeId}:${side}:${index}` },
      });
    }
    const count = await prisma.message.count({ where: { conversationId: room.id, idempotencyKey: { startsWith: `audit-layout-preview-v1:${disputeId}:${side}:` } } });
    console.log(`${side}: ${count} preview messages verified`);
  }
}
main().catch((err) => { console.error(err.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
