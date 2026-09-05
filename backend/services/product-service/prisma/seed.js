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

/* Demo photography.
 *
 * These were `picsum.photos/seed/reloop-pNN`, which is random: the denim
 * jacket showed a mountain and the handbag showed an office block, so
 * nobody could tell whether a card was rendering the right listing. A
 * tag-based service was tried next and was no better — "leatherjacket"
 * returned photographs of iguanas.
 *
 * So each id below is a specific Unsplash photo that was looked at and
 * matched to the listing by hand. Where no photo of the described item
 * existed, the listing text was changed to describe the photo rather than
 * the other way round — this is demo data, and a card whose words and
 * picture disagree is worse than a slightly different product.
 *
 * The second entry is the same photograph anchored to a different crop, so
 * the card's hover-swap has something real to swap to instead of showing a
 * different garment. */
function photos(id) {
  const base = `https://images.unsplash.com/photo-${id}?w=800&h=1000&q=75&fit=crop`;
  return {
    create: [
      { url: base, position: 0 },
      { url: `${base}&crop=top`, position: 1 },
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
    photos: photos("1543163521-1bf539c55dd2"),
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
    photos: photos("1542272604-787c3835535d"),
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
    photos: photos("1591047139829-d91aecb6caea"),
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
    photos: photos("1576566588028-4147f3842f27"),
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
    photos: photos("1549298916-b41d501d3772"),
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
    photos: photos("1560769629-975ec94e6a86"),
    status: "available",
  },
  {
    id: "p07",
    sellerId: SELLER.sneaker,
    title: "รองเท้าหนังลำลอง สีแทน",
    description: "รองเท้าบูทหนังมือสอง ใช้งานได้ปกติ มีรอยขีดข่วนเล็กน้อย",
    price: 550,
    category: "รองเท้า",
    condition: "Fair",
    tags: ["boots", "leather"],
    location: "เชียงใหม่, เมือง",
    size: "41",
    photos: photos("1600185365483-26d7a4cc7519"),
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
    photos: photos("1473496169904-658ba7c44d8a"),
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
    photos: photos("1572804013309-59a88b7e92f1"),
    status: "available",
  },
  {
    id: "p10",
    sellerId: SELLER.vintage,
    title: "เดรสผ้าชีฟองสีขาว ทรงยาว",
    description: "เดรสออกงานสภาพเหมือนใหม่ ใส่ครั้งเดียว ผ้าไม่ยับง่าย",
    price: 1200,
    category: "เดรส",
    condition: "Like New",
    tags: ["dress", "eveningwear", "black"],
    location: "กรุงเทพฯ, สยาม",
    size: "M",
    photos: photos("1515372039744-b8f02a3ae446"),
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
    photos: photos("1556821840-3a63f95609a7"),
    status: "sold",
  },
  {
    id: "p12",
    sellerId: SELLER.vintage,
    title: "เสื้อเชิ้ตผ้าออกซ์ฟอร์ด สีฟ้า",
    description: "เสื้อเชิ้ตลายสก็อตผ้าฝ้าย ใส่สบาย เหมาะกับหน้าฝนเบาๆ",
    price: 290,
    category: "เสื้อผ้า",
    condition: "Good",
    tags: ["flannel", "plaid", "vintage"],
    location: "กรุงเทพฯ, สยาม",
    size: "M",
    photos: photos("1589310243389-96a5483213a8"),
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
    photos: photos("1584917865442-de89df76afd3"),
    status: "available",
  },
  {
    id: "p14",
    sellerId: SELLER.bag,
    title: "กระเป๋าเป้สะพายหลัง สีกรมท่า",
    description: "กระเป๋าเป้สภาพดี ใช้งานไม่กี่ครั้ง เหมาะกับใส่โน้ตบุ๊ก",
    price: 450,
    category: "กระเป๋า",
    condition: "Good",
    tags: ["adidas", "backpack"],
    location: "เชียงใหม่, เมือง",
    size: "Free size",
    photos: photos("1553062407-98eeb64c6a62"),
    status: "available",
  },
  {
    id: "p15",
    sellerId: SELLER.bag,
    title: "กระเป๋าถือหนัง สีเขียวมิ้นต์",
    description: "กระเป๋าคลัตช์ออกงาน สภาพใหม่ ไม่เคยใช้",
    price: 890,
    category: "กระเป๋า",
    condition: "New",
    tags: ["clutch", "eveningwear"],
    location: "เชียงใหม่, เมือง",
    size: "Free size",
    photos: photos("1594223274512-ad4803739b7c"),
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
    photos: photos("1523170335258-f5ed11844a49"),
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
// every change, including the searchable brand field, so q can find brands
// regardless of which code path touches the row (API, this seed script, or
// anything added later). `db push` doesn't run arbitrary SQL, so this — the
// one hook that already runs on every container start — is where it's
// (idempotently) installed.
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
        NEW.title, NEW.description, NEW.category, NEW.brand, NEW.condition,
        NEW.location, NEW.size, array_to_string(NEW.tags, ' ')
      );
      NEW.search_vector :=
        setweight(to_tsvector('simple', coalesce(NEW.title, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(array_to_string(NEW.tags, ' '), '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(NEW.category, '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(NEW.brand, '')), 'B') ||
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
    const { photos: photoSet, ...fields } = product;
    await prisma.product.upsert({
      where: { id: product.id },
      // A reseed used to be a no-op for existing rows (`update: {}`), so
      // corrected demo data never reached a database that had already been
      // seeded once. Photos are replaced wholesale rather than merged.
      update: {
        ...fields,
        photos: { deleteMany: {}, create: photoSet.create },
      },
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
