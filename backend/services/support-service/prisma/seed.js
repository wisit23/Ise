const prisma = require("../src/models/prismaClient");
const helpModel = require("../src/features/help-content/helpModel");
const { seedReferenceData } = require("./seedReferenceData");

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
  await seedReferenceData(prisma);
  for (const article of ARTICLES) {
    if (await prisma.helpArticle.findUnique({ where: { slug: article.slug } }))
      continue;
    const draft = await helpModel.create({
      ...article,
      authorId: "system:faq-seed",
    });
    await helpModel.publish(draft.id);
  }
  console.log(
    "[support-service] reference data and published FAQ revisions ready",
  );
}
if (require.main === module)
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
module.exports = { main };
