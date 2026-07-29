// Idempotent demo data: upserts fixed ids so restarting the container never
// duplicates rows, and `p1`..`p5` stay stable for anyone testing the API by id.
const { PrismaClient } = require("../src/generated/prisma-client");

const prisma = new PrismaClient();

const CATEGORIES = ["เสื้อผ้า", "แจ็คเก็ต", "เดรส", "รองเท้า", "กระเป๋า"];

const CONDITIONS = [
  { value: "New", label: "ใหม่ (New)", sortOrder: 0 },
  { value: "Like New", label: "ใหม่มาก (Like New)", sortOrder: 1 },
  { value: "Good", label: "ดี (Good)", sortOrder: 2 },
  { value: "Fair", label: "พอใช้ (Fair)", sortOrder: 3 },
];

function photo(seed) {
  return {
    create: [
      { url: `https://picsum.photos/seed/reloop-${seed}/600/600`, position: 0 },
    ],
  };
}

const PRODUCTS = [
  {
    id: "p1",
    sellerId: "seed-seller-1",
    title: "เดนิมแจ็คเก็ตวินเทจ Levi's",
    description: "แจ็คเก็ตยีนส์มือสอง สภาพดีมาก ใส่ไม่ถึง 10 ครั้ง ไซส์ M",
    price: 890,
    category: "แจ็คเก็ต",
    condition: "Like New",
    tags: ["vintage", "levis", "denim", "90s"],
    location: "กรุงเทพฯ, จตุจักร",
    size: "M",
    photos: photo("p1"),
    status: "available",
  },
  {
    id: "p2",
    sellerId: "seed-seller-1",
    title: "เดรสลายดอกไม้ วินเทจ",
    description: "เดรสมือสองผ้าเนื้อดี ใส่ออกงานหรือลำลองได้ ไซส์ S",
    price: 450,
    category: "เดรส",
    condition: "Good",
    tags: ["vintage", "floral", "dress"],
    location: "กรุงเทพฯ, จตุจักร",
    size: "S",
    photos: photo("p2"),
    status: "available",
  },
  {
    id: "p3",
    sellerId: "seed-seller-2",
    title: "รองเท้าผ้าใบ Converse สีขาว",
    description: "รองเท้าผ้าใบมือสอง ใส่ 2-3 ครั้ง ไซส์ 40",
    price: 690,
    category: "รองเท้า",
    condition: "Like New",
    tags: ["converse", "sneakers", "white"],
    location: "เชียงใหม่, เมือง",
    size: "40",
    photos: photo("p3"),
    status: "available",
  },
  {
    id: "p4",
    sellerId: "seed-seller-2",
    title: "กระเป๋าสะพายหนัง PU",
    description: "กระเป๋าสะพายข้างมือสอง สภาพใช้งานได้ดี มีรอยใช้งานเล็กน้อย",
    price: 320,
    category: "กระเป๋า",
    condition: "Fair",
    tags: ["bag", "pu-leather"],
    location: "เชียงใหม่, เมือง",
    size: "Free size",
    photos: photo("p4"),
    status: "available",
  },
  {
    id: "p5",
    sellerId: "seed-seller-3",
    title: "เสื้อฮู้ดโอเวอร์ไซส์ สีเทา",
    description: "เสื้อฮู้ดมือสอง ผ้าหนา ใส่สบาย ไซส์ L",
    price: 350,
    category: "เสื้อผ้า",
    condition: "Good",
    tags: ["hoodie", "oversized", "streetwear"],
    location: "กรุงเทพฯ, สยาม",
    size: "L",
    photos: photo("p5"),
    status: "sold",
  },
];

async function main() {
  for (const name of CATEGORIES) {
    await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  for (const condition of CONDITIONS) {
    await prisma.condition.upsert({
      where: { value: condition.value },
      update: { label: condition.label, sortOrder: condition.sortOrder },
      create: condition,
    });
  }
  for (const product of PRODUCTS) {
    await prisma.product.upsert({
      where: { id: product.id },
      update: {},
      create: product,
    });
  }
  console.log(
    `[product-service] seeded ${CATEGORIES.length} categories, ${CONDITIONS.length} conditions, ${PRODUCTS.length} demo products`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
