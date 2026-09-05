// Idempotent: installs the HelpArticle.search_text trigger (rerunnable, see
// ensureSearchTextTrigger) and upserts demo FAQ content by fixed slug.
const { PrismaClient } = require("../src/generated/prisma-client");

const prisma = new PrismaClient();

// help_articles.search_text can't be a native Postgres generated column
// (array_to_string()/concat_ws() are STABLE not IMMUTABLE — see
// schema.prisma and MOCK-TRADE-011's productModel.js for the same issue), so
// a trigger fills the same role. `db push` doesn't run arbitrary SQL, so this
// script — the one hook that already runs on every container start — is
// where it's (idempotently) installed.
async function ensureSearchTextTrigger() {
  await prisma.$executeRaw`
    CREATE OR REPLACE FUNCTION help_articles_set_search_text() RETURNS trigger AS $$
    BEGIN
      NEW.search_text := concat_ws(' ', NEW.title, NEW.body, NEW.category);
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `;
  await prisma.$executeRaw`
    CREATE OR REPLACE TRIGGER help_articles_search_text_trigger
    BEFORE INSERT OR UPDATE ON help_articles
    FOR EACH ROW EXECUTE FUNCTION help_articles_set_search_text();
  `;
  await prisma.$executeRaw`UPDATE help_articles SET updated_at = updated_at;`;
}

const SUPPORT_AGENT_ID = "20000000-0000-0000-0000-000000000001";
const BUYER_ID = "30000000-0000-0000-0000-000000000001";
const SELLER_DENIM = "10000000-0000-0000-0000-000000000001";
const SELLER_VINTAGE = "10000000-0000-0000-0000-000000000003";
// Same dispute this order-service's own seed opens — links the demo ticket
// to a demo dispute so the two features look connected, like a real case.
const DISPUTED_ORDER_ID = "d0000000-0000-0000-0000-000000000001";

const DAY_MS = 24 * 60 * 60 * 1000;

const TICKETS = [
  {
    id: "f0000000-0000-0000-0000-000000000001",
    ticketNumber: "#CS-000001",
    requesterId: SELLER_DENIM,
    subject: "สอบถามเรื่องการยืนยันบัญชีผู้ขาย (KYC)",
    description:
      "อยากทราบว่าต้องส่งเอกสารอะไรเพิ่มไหมครับถึงจะยืนยันบัญชีผู้ขายผ่าน",
    category: "ACCOUNT",
    status: "NEW",
    priority: "NORMAL",
    slaDueAtOffsetMs: DAY_MS,
  },
  {
    id: "f0000000-0000-0000-0000-000000000002",
    ticketNumber: "#CS-000002",
    requesterId: BUYER_ID,
    subject: "ตามเรื่องข้อพิพาทสินค้าชำรุด",
    description: "อยากทราบความคืบหน้าเรื่องที่เปิดข้อพิพาทไปครับ",
    category: "PAYMENT",
    orderId: DISPUTED_ORDER_ID,
    status: "IN_PROGRESS",
    priority: "URGENT",
    assigneeId: SUPPORT_AGENT_ID,
    slaDueAtOffsetMs: 60 * 60 * 1000,
    firstResponseAtOffsetMs: -30 * 60 * 1000,
    message: {
      authorId: SUPPORT_AGENT_ID,
      authorRole: "AGENT",
      body: "รับเรื่องแล้วครับ กำลังตรวจสอบหลักฐานที่แนบมา จะแจ้งผลภายในวันนี้",
    },
  },
  {
    id: "f0000000-0000-0000-0000-000000000003",
    ticketNumber: "#CS-000003",
    requesterId: SELLER_VINTAGE,
    subject: "อัปโหลดรูปสินค้าไม่ได้ ระบบขึ้น Error",
    description: "กดเพิ่มรูปตอนลงขายแล้วระบบค้าง ลองหลายรอบแล้วยังไม่ได้ครับ",
    category: "TECHNICAL",
    status: "ESCALATED",
    priority: "HIGH",
    slaDueAtOffsetMs: -2 * 60 * 60 * 1000,
    escalatedAtOffsetMs: -30 * 60 * 1000,
  },
];

const ARTICLES = [
  {
    slug: "how-to-track-order",
    title: "ติดตามสถานะคำสั่งซื้อได้อย่างไร",
    body: 'เข้าเมนู "คำสั่งซื้อของฉัน" เพื่อดูสถานะล่าสุดของทุกออเดอร์ หากสถานะไม่อัปเดตเกิน 3 วัน ติดต่อทีมซัพพอร์ตได้ทันที',
    category: "ORDER",
  },
  {
    slug: "how-to-request-refund",
    title: "ขอคืนเงิน/คืนสินค้าทำอย่างไร",
    body: 'กดปุ่ม "ขอคืนเงิน/คืนสินค้า" ที่หน้าคำสั่งซื้อก่อนกดยืนยันรับของ แนบเหตุผลและรูปภาพ/วิดีโอหลักฐานให้ครบ ทีมงานจะตรวจสอบภายใน 48 ชั่วโมง',
    category: "PAYMENT",
  },
  {
    slug: "how-to-become-seller",
    title: "สมัครเป็นผู้ขายต้องทำอย่างไร",
    body: 'สมัครสมาชิกแล้วเลือกประเภทบัญชีผู้ขาย กรอกชื่อร้านค้า จากนั้นเข้าเมนู "ลงขายสินค้า" เพื่อเริ่มลงสินค้าชิ้นแรก',
    category: "ACCOUNT",
  },
  {
    slug: "how-to-contact-seller",
    title: "วิธีติดต่อผู้ขายก่อนสั่งซื้อ",
    body: "กดปุ่มดูร้านค้าที่หน้ารายละเอียดสินค้า แล้วดูช่องทางติดต่อที่ผู้ขายระบุไว้",
    category: "OTHER",
  },
];

async function main() {
  await ensureSearchTextTrigger();

  for (const article of ARTICLES) {
    await prisma.helpArticle.upsert({
      where: { slug: article.slug },
      update: {},
      create: {
        ...article,
        status: "PUBLISHED",
        authorId: SUPPORT_AGENT_ID,
        publishedAt: new Date(),
      },
    });
  }

  const now = Date.now();
  for (const ticket of TICKETS) {
    const {
      slaDueAtOffsetMs,
      firstResponseAtOffsetMs,
      escalatedAtOffsetMs,
      message,
      ...fields
    } = ticket;

    await prisma.supportTicket.upsert({
      where: { id: ticket.id },
      update: {},
      create: {
        ...fields,
        slaDueAt: new Date(now + slaDueAtOffsetMs),
        firstResponseAt:
          firstResponseAtOffsetMs !== undefined
            ? new Date(now + firstResponseAtOffsetMs)
            : undefined,
        escalatedAt:
          escalatedAtOffsetMs !== undefined
            ? new Date(now + escalatedAtOffsetMs)
            : undefined,
      },
    });

    if (message) {
      const existing = await prisma.ticketMessage.findFirst({
        where: { ticketId: ticket.id },
      });
      if (!existing) {
        await prisma.ticketMessage.create({
          data: { ticketId: ticket.id, ...message },
        });
      }
    }
  }

  console.log(
    `[support-service] installed search_text trigger, seeded ${ARTICLES.length} FAQ articles and ${TICKETS.length} demo tickets`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
