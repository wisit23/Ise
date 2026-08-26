// Idempotent demo data: upserts fixed ids so restarting the container never
// duplicates rows, and each id stays stable for anyone testing the API by id.
// sellerId values below match the fixed UUIDs seeded in
// backend/services/auth-service/prisma/seed.js — real registered accounts,
// not placeholder strings, so each seller's store page shows a real shop
// name/rating instead of falling back to "ร้านค้า".
const { PrismaClient } = require("../src/generated/prisma-client");

const prisma = new PrismaClient();

const SELLER = {
  denim: "10000000-0000-0000-0000-000000000001",
  sneaker: "10000000-0000-0000-0000-000000000002",
  vintage: "10000000-0000-0000-0000-000000000003",
  bag: "10000000-0000-0000-0000-000000000004",
};

const CATEGORIES = [
  "เสื้อผ้า",
  "เสื้อยืด",
  "แจ็คเก็ต",
  "กางเกง",
  "เดรส",
  "รองเท้า",
  "กระเป๋า",
  "เครื่องประดับ",
];

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
    id: "p01",
    sellerId: SELLER.denim,
    title: "เดนิมแจ็คเก็ตวินเทจ Levi's",
    description: "แจ็คเก็ตยีนส์มือสอง สภาพดีมาก ใส่ไม่ถึง 10 ครั้ง ไซส์ M",
    price: 890,
    category: "แจ็คเก็ต",
    condition: "Like New",
    tags: ["vintage", "levis", "denim", "90s"],
    location: "กรุงเทพฯ, จตุจักร",
    size: "M",
    photos: photo("p01"),
    status: "available",
  },
  {
    id: "p02",
    sellerId: SELLER.denim,
    title: "กางเกงยีนส์ Levi's 501 ทรงตรง",
    description: "กางเกงยีนส์ทรงคลาสสิก ผ้าหนา ไม่ยืด สภาพดี",
    price: 650,
    category: "กางเกง",
    condition: "Good",
    tags: ["levis", "501", "denim"],
    location: "กรุงเทพฯ, จตุจักร",
    size: "30",
    photos: photo("p02"),
    status: "available",
  },
  {
    id: "p03",
    sellerId: SELLER.denim,
    title: "แจ็คเก็ตหนังแท้สีน้ำตาล",
    description: "แจ็คเก็ตหนังแท้มือสอง มีรอยใช้งานตามอายุ กลิ่นหนังแท้ชัดเจน",
    price: 1800,
    category: "แจ็คเก็ต",
    condition: "Fair",
    tags: ["leather", "jacket", "genuine-leather"],
    location: "กรุงเทพฯ, จตุจักร",
    size: "L",
    photos: photo("p03"),
    status: "available",
  },
  {
    id: "p04",
    sellerId: SELLER.denim,
    title: "เสื้อยืด Uniqlo วินเทจ",
    description: "เสื้อยืดสภาพดีมาก ใส่ไม่กี่ครั้ง ไม่มีตำหนิ",
    price: 199,
    category: "เสื้อยืด",
    condition: "Like New",
    tags: ["uniqlo", "vintage", "streetwear"],
    location: "กรุงเทพฯ, จตุจักร",
    size: "M",
    photos: photo("p04"),
    status: "available",
  },
  {
    id: "p05",
    sellerId: SELLER.sneaker,
    title: "รองเท้าผ้าใบ Converse สีขาว",
    description: "รองเท้าผ้าใบมือสอง ใส่ 2-3 ครั้ง ไซส์ 40",
    price: 690,
    category: "รองเท้า",
    condition: "Like New",
    tags: ["converse", "sneakers", "white"],
    location: "เชียงใหม่, เมือง",
    size: "40",
    photos: photo("p05"),
    status: "available",
  },
  {
    id: "p06",
    sellerId: SELLER.sneaker,
    title: "รองเท้าวิ่ง Nike Air Zoom",
    description:
      "รองเท้าวิ่งสภาพดี พื้นยังไม่สึกเยอะ เหมาะกับใส่วิ่งหรือใส่ลำลอง",
    price: 1500,
    category: "รองเท้า",
    condition: "Good",
    tags: ["nike", "running", "airzoom"],
    location: "เชียงใหม่, เมือง",
    size: "42",
    photos: photo("p06"),
    status: "available",
  },
  {
    id: "p07",
    sellerId: SELLER.sneaker,
    title: "รองเท้าบูทหนังลำลอง",
    description: "รองเท้าบูทหนังมือสอง ใช้งานได้ปกติ มีรอยขีดข่วนเล็กน้อย",
    price: 550,
    category: "รองเท้า",
    condition: "Fair",
    tags: ["boots", "leather"],
    location: "เชียงใหม่, เมือง",
    size: "41",
    photos: photo("p07"),
    status: "available",
  },
  {
    id: "p08",
    sellerId: SELLER.sneaker,
    title: "แว่นกันแดดแบรนด์เนม",
    description: "แว่นกันแดดของแท้ มีกล่องและถุงผ้าให้ครบ",
    price: 750,
    category: "เครื่องประดับ",
    condition: "Like New",
    tags: ["sunglasses", "accessories"],
    location: "เชียงใหม่, เมือง",
    size: "Free size",
    photos: photo("p08"),
    status: "available",
  },
  {
    id: "p09",
    sellerId: SELLER.vintage,
    title: "เดรสลายดอกไม้ วินเทจ",
    description: "เดรสมือสองผ้าเนื้อดี ใส่ออกงานหรือลำลองได้ ไซส์ S",
    price: 450,
    category: "เดรส",
    condition: "Good",
    tags: ["vintage", "floral", "dress"],
    location: "กรุงเทพฯ, สยาม",
    size: "S",
    photos: photo("p09"),
    status: "available",
  },
  {
    id: "p10",
    sellerId: SELLER.vintage,
    title: "เดรสราตรีสีดำ",
    description: "เดรสออกงานสภาพเหมือนใหม่ ใส่ครั้งเดียว ผ้าไม่ยับง่าย",
    price: 1200,
    category: "เดรส",
    condition: "Like New",
    tags: ["dress", "eveningwear", "black"],
    location: "กรุงเทพฯ, สยาม",
    size: "M",
    photos: photo("p10"),
    status: "available",
  },
  {
    id: "p11",
    sellerId: SELLER.vintage,
    title: "เสื้อฮู้ดโอเวอร์ไซส์ สีเทา",
    description: "เสื้อฮู้ดมือสอง ผ้าหนา ใส่สบาย ไซส์ L",
    price: 350,
    category: "เสื้อผ้า",
    condition: "Good",
    tags: ["hoodie", "oversized", "streetwear"],
    location: "กรุงเทพฯ, สยาม",
    size: "L",
    photos: photo("p11"),
    status: "sold",
  },
  {
    id: "p12",
    sellerId: SELLER.vintage,
    title: "เสื้อเชิ้ตลายสก็อตวินเทจ",
    description: "เสื้อเชิ้ตลายสก็อตผ้าฝ้าย ใส่สบาย เหมาะกับหน้าฝนเบาๆ",
    price: 290,
    category: "เสื้อผ้า",
    condition: "Good",
    tags: ["flannel", "plaid", "vintage"],
    location: "กรุงเทพฯ, สยาม",
    size: "M",
    photos: photo("p12"),
    status: "available",
  },
  {
    id: "p13",
    sellerId: SELLER.bag,
    title: "กระเป๋าสะพายหนัง PU",
    description: "กระเป๋าสะพายข้างมือสอง สภาพใช้งานได้ดี มีรอยใช้งานเล็กน้อย",
    price: 320,
    category: "กระเป๋า",
    condition: "Fair",
    tags: ["bag", "pu-leather"],
    location: "เชียงใหม่, เมือง",
    size: "Free size",
    photos: photo("p13"),
    status: "available",
  },
  {
    id: "p14",
    sellerId: SELLER.bag,
    title: "กระเป๋าเป้ Adidas มือสอง",
    description: "กระเป๋าเป้สภาพดี ใช้งานไม่กี่ครั้ง เหมาะกับใส่โน้ตบุ๊ก",
    price: 450,
    category: "กระเป๋า",
    condition: "Good",
    tags: ["adidas", "backpack"],
    location: "เชียงใหม่, เมือง",
    size: "Free size",
    photos: photo("p14"),
    status: "available",
  },
  {
    id: "p15",
    sellerId: SELLER.bag,
    title: "กระเป๋าคลัตช์ราตรี",
    description: "กระเป๋าคลัตช์ออกงาน สภาพใหม่ ไม่เคยใช้",
    price: 890,
    category: "กระเป๋า",
    condition: "New",
    tags: ["clutch", "eveningwear"],
    location: "เชียงใหม่, เมือง",
    size: "Free size",
    photos: photo("p15"),
    status: "available",
  },
  {
    id: "p16",
    sellerId: SELLER.bag,
    title: "นาฬิกาข้อมือวินเทจ",
    description: "นาฬิกาข้อมือสายหนัง เดินเที่ยงตรง มีรอยใช้งานตามอายุ",
    price: 990,
    category: "เครื่องประดับ",
    condition: "Good",
    tags: ["watch", "vintage", "accessories"],
    location: "เชียงใหม่, เมือง",
    size: "Free size",
    photos: photo("p16"),
    status: "available",
  },
];

// Public-domain sample clips (Blender Foundation, CC-licensed) — just
// placeholders so the swipe feed ("ปัดดูสินค้า") isn't empty out of the box.
const DEMO_VIDEOS = [
  {
    id: "pv1",
    productId: "p01",
    sellerId: SELLER.denim,
    sellerName: "มานพ",
    videoUrl:
      "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    description: "แจ็คเก็ตวินเทจตัวนี้ผ้าดีมาก ใส่สบาย รีวิวจริงจากผู้ขาย",
  },
  {
    id: "pv2",
    productId: "p05",
    sellerId: SELLER.sneaker,
    sellerName: "ปิยะ",
    videoUrl:
      "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    description: "รองเท้าคู่นี้สภาพเหมือนใหม่ ไม่มีตำหนิ",
  },
];

// products.search_text/search_vector can't be native generated columns (the
// expression needs array_to_string(), which is STABLE not IMMUTABLE — see
// schema.prisma), so a trigger fills the same role: keep it auto-computed on
// every insert/update no matter which code path touches the row (API, this
// seed script, or anything added later). `db push` doesn't run arbitrary
// SQL, so this — the one hook that already runs on every container
// start — is where it's (idempotently) installed.
async function ensureSearchTextTrigger() {
  // Kept here as well as in schema.prisma so existing databases are upgraded
  // safely before the trigger starts writing the new full-text document.
  await prisma.$executeRaw`
    ALTER TABLE products
    ADD COLUMN IF NOT EXISTS search_vector tsvector;
  `;
  await prisma.$executeRaw`
    CREATE OR REPLACE FUNCTION products_set_search_text() RETURNS trigger AS $$
    BEGIN
      NEW.search_text := concat_ws(' ',
        NEW.title, NEW.description, NEW.category, NEW.condition,
        NEW.location, NEW.size, array_to_string(NEW.tags, ' ')
      );
      NEW.search_vector :=
        setweight(to_tsvector('simple', coalesce(NEW.title, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(array_to_string(NEW.tags, ' '), '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(NEW.category, '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(NEW.description, '')), 'C') ||
        setweight(to_tsvector('simple', concat_ws(' ', NEW.condition, NEW.location, NEW.size)), 'D');
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `;
  await prisma.$executeRaw`
    CREATE OR REPLACE TRIGGER products_search_text_trigger
    BEFORE INSERT OR UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION products_set_search_text();
  `;
  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS products_search_vector_idx
    ON products USING GIN (search_vector);
  `;
  // Backfill: the trigger only fires on rows written after it exists, so
  // force it for every existing row too. Cheap and safe to rerun every start.
  // Touches updated_at (a no-op value) rather than id, to avoid re-triggering
  // the id's ON UPDATE CASCADE to photos/videos/product_videos for no reason.
  await prisma.$executeRaw`UPDATE products SET updated_at = updated_at;`;
}

async function main() {
  await ensureSearchTextTrigger();

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
  for (const video of DEMO_VIDEOS) {
    await prisma.productVideo.upsert({
      where: { id: video.id },
      update: {},
      create: video,
    });
  }
  console.log(
    `[product-service] seeded ${CATEGORIES.length} categories, ${CONDITIONS.length} conditions, ${PRODUCTS.length} demo products across ${Object.keys(SELLER).length} stores, ${DEMO_VIDEOS.length} demo review clips`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
