// Idempotent demo catalog: upserts fixed ids so restarting the container never
// duplicates rows, and `p1`..`p5` stay stable for anyone testing the API by id.
const { PrismaClient } = require("../src/generated/prisma-client");

const prisma = new PrismaClient();

const PRODUCTS = [
  {
    id: "p1",
    sellerId: "seed-seller-1",
    title: "เดนิมแจ็คเก็ตวินเทจ Levi's",
    description: "แจ็คเก็ตยีนส์มือสอง สภาพดีมาก ใส่ไม่ถึง 10 ครั้ง ไซส์ M",
    price: 890,
    category: "แจ็คเก็ต",
    condition: "ดีมาก",
    size: "M",
    images: ["https://picsum.photos/seed/reloop-p1/600/600"],
    status: "available",
  },
  {
    id: "p2",
    sellerId: "seed-seller-1",
    title: "เดรสลายดอกไม้ วินเทจ",
    description: "เดรสมือสองผ้าเนื้อดี ใส่ออกงานหรือลำลองได้ ไซส์ S",
    price: 450,
    category: "เดรส",
    condition: "ดี",
    size: "S",
    images: ["https://picsum.photos/seed/reloop-p2/600/600"],
    status: "available",
  },
  {
    id: "p3",
    sellerId: "seed-seller-2",
    title: "รองเท้าผ้าใบ Converse สีขาว",
    description: "รองเท้าผ้าใบมือสอง ใส่ 2-3 ครั้ง ไซส์ 40",
    price: 690,
    category: "รองเท้า",
    condition: "ดีมาก",
    size: "40",
    images: ["https://picsum.photos/seed/reloop-p3/600/600"],
    status: "available",
  },
  {
    id: "p4",
    sellerId: "seed-seller-2",
    title: "กระเป๋าสะพายหนัง PU",
    description: "กระเป๋าสะพายข้างมือสอง สภาพใช้งานได้ดี มีรอยใช้งานเล็กน้อย",
    price: 320,
    category: "กระเป๋า",
    condition: "พอใช้",
    size: "Free size",
    images: ["https://picsum.photos/seed/reloop-p4/600/600"],
    status: "available",
  },
  {
    id: "p5",
    sellerId: "seed-seller-3",
    title: "เสื้อฮู้ดโอเวอร์ไซส์ สีเทา",
    description: "เสื้อฮู้ดมือสอง ผ้าหนา ใส่สบาย ไซส์ L",
    price: 350,
    category: "เสื้อผ้า",
    condition: "ดี",
    size: "L",
    images: ["https://picsum.photos/seed/reloop-p5/600/600"],
    status: "sold",
  },
];

async function main() {
  for (const product of PRODUCTS) {
    await prisma.product.upsert({
      where: { id: product.id },
      update: {},
      create: product,
    });
  }
  console.log(`[product-service] seeded ${PRODUCTS.length} demo products`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
