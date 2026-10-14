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

// Each added listing has its own reviewed Unsplash photograph. Keep the original
// group photoId only to recognize and upgrade the earlier shared demo photos.
const EXTRA_PRODUCT_GROUPS = [
  {
    category: "เสื้อผ้า",
    sellerId: SELLER.vintage,
    photoId: "1556821840-3a63f95609a7",
    photoIds: [
      "1620799140188-3b2a02fd9a77", // unsplash.com/photos/kJXGTOY1wLQ
      "1680292783974-a9a336c10366", // unsplash.com/photos/SXpun7pdECU
      "1601063476271-a159c71ab0b3", // unsplash.com/photos/QWlXPidIgI8
      "1564557287817-3785e38ec1f5", // unsplash.com/photos/ZCoqcrWp9GY
      "1579572331145-5e53b299c64e", // unsplash.com/photos/REOoETloFqE
      "1685354218016-3899c9ef79ad", // unsplash.com/photos/ggcJKGpx3pI
    ],
    tags: ["hoodie", "casual"],
    description: "เสื้อฮู้ดผ้านุ่ม มีหมวกและกระเป๋าหน้า เหมาะกับใส่ลำลอง",
    variants: [
      ["เสื้อฮู้ดลำลอง ทรงพอดีตัว", 250, "S", "Good"],
      ["เสื้อฮู้ดผ้าหนา ไซส์ M", 320, "M", "Like New"],
      ["เสื้อฮู้ดโอเวอร์ไซส์ ไซส์ XL", 390, "XL", "Good"],
      ["เสื้อฮู้ดมือสอง สำหรับวันพักผ่อน", 180, "L", "Fair"],
      ["เสื้อฮู้ดผ้านุ่ม ป้ายยังอยู่", 490, "M", "New"],
      ["เสื้อฮู้ดทรงหลวม ไซส์ XXL", 350, "XXL", "Like New"],
    ],
  },
  {
    category: "เสื้อยืด",
    sellerId: SELLER.denim,
    photoId: "1576566588028-4147f3842f27",
    photoIds: [
      "1581655353564-df123a1eb820", // unsplash.com/photos/acn5ERAeSb4
      "1583743814966-8936f5b7be1a", // unsplash.com/photos/Wr0TpKqf26s
      "1521572163474-6864f9cf17ab", // unsplash.com/photos/WWesmHEgXDs
      "1618354691373-d851c5c3a990", // unsplash.com/photos/6Nub980bI3I
      "1651761179569-4ba2aa054997", // unsplash.com/photos/4rUYuwJ2vGw
      "1622445275463-afa2ab738c34", // unsplash.com/photos/ogmenj2NGho
    ],
    tags: ["tshirt", "casual"],
    description: "เสื้อยืดคอกลม ผ้าใส่สบาย จับคู่กับยีนส์หรือกางเกงขาสั้นได้",
    variants: [
      ["เสื้อยืดคอกลม ไซส์ S", 120, "S", "Good"],
      ["เสื้อยืดลำลอง ไซส์ M", 150, "M", "Like New"],
      ["เสื้อยืดทรงหลวม ไซส์ L", 180, "L", "Good"],
      ["เสื้อยืดโอเวอร์ไซส์ ไซส์ XL", 220, "XL", "Like New"],
      ["เสื้อยืดคอกลม ยังไม่ผ่านการใช้งาน", 290, "M", "New"],
      ["เสื้อยืดมือสอง ใส่อยู่บ้าน", 80, "L", "Fair"],
    ],
  },
  {
    category: "แจ็คเก็ต",
    sellerId: SELLER.denim,
    photoId: "1543163521-1bf539c55dd2",
    photoIds: [
      "1611312449408-fcece27cdbb7", // unsplash.com/photos/QRN47la37gw
      "1537465978529-d23b17165b3b", // unsplash.com/photos/KKZmUQjTO2E
      "1543076447-215ad9ba6923", // unsplash.com/photos/_BDBEP0ePQc
      "1495105787522-5334e3ffa0ef", // unsplash.com/photos/TnNo84AJJ5A
      "1614699745279-2c61bd9d46b5", // unsplash.com/photos/sN9BqTtWJIE
      "1555583743-991174c11425", // unsplash.com/photos/1QOsJGbNIgk
    ],
    tags: ["denim", "jacket", "vintage"],
    description: "แจ็คเก็ตยีนส์ติดกระดุม มีกระเป๋าหน้า ใส่คลุมเสื้อยืดได้",
    variants: [
      ["แจ็คเก็ตยีนส์ทรงสั้น ไซส์ S", 590, "S", "Good"],
      ["แจ็คเก็ตยีนส์คลาสสิก ไซส์ M", 750, "M", "Like New"],
      ["แจ็คเก็ตยีนส์ทรงหลวม ไซส์ L", 690, "L", "Good"],
      ["แจ็คเก็ตยีนส์โอเวอร์ไซส์ ไซส์ XL", 850, "XL", "Like New"],
      ["แจ็คเก็ตยีนส์มือสอง ลุควินเทจ", 390, "M", "Fair"],
      ["แจ็คเก็ตยีนส์ตัวใหม่ พร้อมส่งต่อ", 990, "L", "New"],
    ],
  },
  {
    category: "กางเกง",
    sellerId: SELLER.denim,
    photoId: "1542272604-787c3835535d",
    photoIds: [
      "1582552938357-32b906df40cb", // unsplash.com/photos/Zy6oNZRdcjc
      "1602293589930-45aad59ba3ab", // unsplash.com/photos/EtOMMg1nSR8
      "1714729382668-7bc3bb261662", // unsplash.com/photos/2QSK4kFoVZE
      "1598554747436-c9293d6a588f", // unsplash.com/photos/2s3GhhJz2uY
      "1637069585336-827b298fe84a", // unsplash.com/photos/aWLTXw6kbDw
      "1604176354204-9268737828e4", // unsplash.com/photos/EDSTj4kCUcw
    ],
    tags: ["denim", "jeans"],
    description: "กางเกงยีนส์ขายาวทรงตรง ผ้าไม่ยืด ใส่ได้หลายโอกาส",
    variants: [
      ["กางเกงยีนส์ทรงตรง เอว 26", 350, "26", "Good"],
      ["กางเกงยีนส์ลำลอง เอว 28", 450, "28", "Like New"],
      ["กางเกงยีนส์ทรงคลาสสิก เอว 30", 490, "30", "Good"],
      ["กางเกงยีนส์ขายาว เอว 32", 550, "32", "Like New"],
      ["กางเกงยีนส์มือสอง เอว 34", 250, "34", "Fair"],
      ["กางเกงยีนส์ยังไม่เคยใส่ เอว 36", 790, "36", "New"],
    ],
  },
  {
    category: "เดรส",
    sellerId: SELLER.vintage,
    photoId: "1572804013309-59a88b7e92f1",
    photoIds: [
      "1496747611176-843222e1e57c", // unsplash.com/photos/68csPWTnafo
      "1542295669297-4d352b042bca", // unsplash.com/photos/sg_gRhbYXhc
      "1715852700550-6436320162e6", // unsplash.com/photos/SoKWaOT_Imw
      "1511130558090-00af810c21b1", // unsplash.com/photos/lSLq_xQdFNI
      "1762154057377-cc9d3dd6900c", // unsplash.com/photos/cRpcTf0VfuE
      "1602010069450-0a62034f235c", // unsplash.com/photos/2ZXVU3BJzN4
    ],
    tags: ["dress", "floral", "vintage"],
    description: "เดรสลายดอกไม้ ผ้าเบา ใส่เที่ยวหรือใส่ลำลองได้",
    variants: [
      ["เดรสลายดอกไม้ ไซส์ XS", 290, "XS", "Good"],
      ["เดรสลายดอกไม้ สำหรับวันหยุด", 390, "S", "Like New"],
      ["เดรสวินเทจลายดอก ไซส์ M", 450, "M", "Good"],
      ["เดรสลายดอกไม้ ไซส์ L", 490, "L", "Like New"],
      ["เดรสลายดอกมือสอง ราคาประหยัด", 190, "M", "Fair"],
      ["เดรสลายดอกไม้ตัวใหม่ ไซส์ XL", 690, "XL", "New"],
    ],
  },
  {
    category: "รองเท้า",
    sellerId: SELLER.sneaker,
    photoId: "1560769629-975ec94e6a86",
    photoIds: [
      "1542291026-7eec264c27ff", // unsplash.com/photos/164_6wVEHfI
      "1606107557195-0e29a4b5b4aa", // unsplash.com/photos/kP6knT7tjn4
      "1595950653106-6c9ebd614d3a", // unsplash.com/photos/jvoZ-Aux9aw
      "1600269452121-4f2416e55c28", // unsplash.com/photos/SD9Jyl1xNQ4
      "1525966222134-fcfa99b8ae77", // unsplash.com/photos/a-QH9MAAVNI
      "1608231387042-66d1773070a5", // unsplash.com/photos/NUoPWImmjCU
    ],
    tags: ["sneakers", "sport", "casual"],
    description: "รองเท้าผ้าใบผูกเชือก เหมาะกับใส่เดินและใส่ลำลอง",
    variants: [
      ["รองเท้าผ้าใบลำลอง ไซส์ 37", 490, "37", "Good"],
      ["รองเท้าผ้าใบใส่เดิน ไซส์ 38", 690, "38", "Like New"],
      ["รองเท้าผ้าใบทรงสปอร์ต ไซส์ 39", 590, "39", "Good"],
      ["รองเท้าผ้าใบลำลอง ไซส์ 40", 790, "40", "Like New"],
      ["รองเท้าผ้าใบมือสอง ไซส์ 41", 350, "41", "Fair"],
      ["รองเท้าผ้าใบคู่ใหม่ ไซส์ 43", 1190, "43", "New"],
    ],
  },
  {
    category: "กระเป๋า",
    sellerId: SELLER.bag,
    photoId: "1553062407-98eeb64c6a62",
    photoIds: [
      "1547949003-9792a18a2601", // unsplash.com/photos/BmH09wAkJa8
      "1622560480654-d96214fdc887", // unsplash.com/photos/SwWCo1k92M4
      "1622560480605-d83c853bc5c3", // unsplash.com/photos/3o-X8WJOP5E
      "1509762774605-f07235a08f1f", // unsplash.com/photos/8sjBzL1IyMo
      "1581605405669-fcdf81165afa", // unsplash.com/photos/8TSqJoI-NVs
      "1622260614153-03223fb72052", // unsplash.com/photos/MzTTVl_trFw
    ],
    tags: ["bag", "backpack"],
    description: "กระเป๋าเป้สะพายหลัง มีช่องเก็บของ เหมาะกับใช้งานประจำวัน",
    variants: [
      ["กระเป๋าเป้ลำลอง สำหรับวันทำงาน", 350, "Free size", "Good"],
      ["กระเป๋าเป้สะพายหลัง ใช้งานน้อย", 490, "Free size", "Like New"],
      ["กระเป๋าเป้สำหรับวันหยุด", 390, "Free size", "Good"],
      ["กระเป๋าเป้มือสอง ราคาประหยัด", 190, "Free size", "Fair"],
      ["กระเป๋าเป้ใบใหม่ พร้อมใช้งาน", 690, "Free size", "New"],
      ["กระเป๋าเป้สะพายหลัง สำหรับนักเรียน", 450, "Free size", "Like New"],
    ],
  },
  {
    category: "เครื่องประดับ",
    sellerId: SELLER.bag,
    photoId: "1523170335258-f5ed11844a49",
    photoIds: [
      "1522312346375-d1a52e2b99b3", // unsplash.com/photos/VRERJ5Mjp4c
      "1620625515032-6ed0c1790c75", // unsplash.com/photos/LWPPpkn6NEQ
      "1524805444758-089113d48a6d", // unsplash.com/photos/12V36G17IbQ
      "1542496658-e33a6d0d50f6", // unsplash.com/photos/4R_WEmhx8og
      "1547996160-81dfa63595aa", // unsplash.com/photos/p2WUEFGrAdA
      "1622434641406-a158123450f9", // unsplash.com/photos/lz6z9GZu8hk
    ],
    tags: ["watch", "accessories", "vintage"],
    description: "นาฬิกาข้อมือแบบเข็ม เหมาะกับใส่ลำลองหรือใส่ไปทำงาน",
    variants: [
      ["นาฬิกาข้อมือ ลุคคลาสสิก", 590, "Free size", "Good"],
      ["นาฬิกาข้อมือสภาพเหมือนใหม่", 890, "Free size", "Like New"],
      ["นาฬิกาข้อมือ สำหรับวันทำงาน", 750, "Free size", "Good"],
      ["นาฬิกาข้อมือมือสอง มีรอยใช้งาน", 350, "Free size", "Fair"],
      ["นาฬิกาข้อมือเรือนใหม่ พร้อมส่งต่อ", 1290, "Free size", "New"],
      ["นาฬิกาข้อมือ สไตล์วินเทจ", 990, "Free size", "Like New"],
    ],
  },
];

const EXTRA_PRODUCTS = EXTRA_PRODUCT_GROUPS.flatMap((group, groupIndex) =>
  group.variants.map(([title, price, size, condition], variantIndex) => ({
    id: `p${17 + groupIndex * 6 + variantIndex}`,
    sellerId: group.sellerId,
    title,
    description: `${group.description} ไซส์ ${size} สภาพ${CONDITIONS.find((item) => item.value === condition).label}`,
    price,
    category: group.category,
    brand: "",
    condition,
    tags: group.tags,
    location: [SELLER.sneaker, SELLER.bag].includes(group.sellerId)
      ? "เชียงใหม่, เมือง"
      : group.sellerId === SELLER.denim
        ? "กรุงเทพฯ, จตุจักร"
        : "กรุงเทพฯ, สยาม",
    size,
    photos: photos(group.photoIds[variantIndex]),
    status: "available",
  })),
);

const PRODUCTS = [
  {
    id: "p01",
    sellerId: SELLER.denim,
    title: "เดนิมแจ็คเก็ตวินเทจ Levi's",
    description: "แจ็คเก็ตยีนส์มือสอง สภาพดีมาก ใส่ไม่ถึง 10 ครั้ง ไซส์ M",
    price: 890,
    category: "แจ็คเก็ต",
    brand: "Levi's",
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
    brand: "Levi's",
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
    brand: "",
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
    brand: "Uniqlo",
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
    brand: "Converse",
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
    brand: "Nike",
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
    brand: "Ray-Ban",
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
  ...EXTRA_PRODUCTS,
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
// anything added later). `db push` doesn't run arbitrary
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
    ALTER TABLE products
    ADD COLUMN IF NOT EXISTS brand text NOT NULL DEFAULT '';
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
        setweight(to_tsvector('simple', concat_ws(' ', NEW.brand, NEW.condition, NEW.location, NEW.size)), 'D');
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

const DEMO_ARTICLES = [
  {
    id: "art-01",
    title:
      "5 วิธีดูแลเสื้อผ้ามือสอง ซักและถนอมอย่างไรให้เนื้อผ้าสวยทนเหมือนใหม่",
    summary:
      "ไขข้อข้องใจคนรักแฟชั่นวินเทจ เคล็ดลับการทำความสะอาด ฆ่าเชื้อ และถนอมเส้นใยเสื้อผ้ามือสองให้สะอาด ปลอดภัย และคงรูปทรงสวยงามยาวนาน",
    content: `การซื้อเสื้อผ้ามือสองนอกจากจะช่วยประหยัดเงินและได้ไอเทมที่มีเอกลักษณ์ไม่ซ้ำใครแล้ว ยังเป็นการช่วยลดขยะสิ่งทอและรักษาสิ่งแวดล้อมอีกด้วย แต่หลายคนอาจยังกังวลเรื่องความสะอาดและวิธีดูแลรักษา วันนี้ RE-LOOP รวบรวม 5 เคล็ดลับดูแลเสื้อผ้ามือสองมาฝากกันครับ\n\n### 1. เช็กป้าย Care Label ก่อนลงมือซักเสมอ\nก่อนนำเสื้อผ้ามือสองไปซัก ควรสังเกตป้ายแนะนำการดูแลรักษาที่ติดมากับตัวเสื้อ โดยเฉพาะสัญลักษณ์การซัก อุณหภูมิน้ำที่เหมาะสม และข้อห้ามในการรีด หากเป็นผ้าเนื้อละเอียด เช่น ผ้าไหม หรือผ้าวูล ควรส่งซักแห้งเพื่อป้องกันเนื้อผ้าหดตัว\n\n### 2. ซักทำความสะอาดและฆ่าเชื้อในครั้งแรก\nสำหรับเสื้อผ้าที่เพิ่งซื้อมา แนะนำให้แช่ด้วยน้ำยาฆ่าเชื้อสำหรับซักผ้าหรือผสมน้ำส้มสายชูเล็กน้อย (ประมาณ 1/2 ถ้วย) ในน้ำอุณหภูมิปกติประมาณ 15-20 นาทีก่อนซักตามปกติ เพื่อช่วยกำจัดกลิ่นอับ เชื้อแบคทีเรีย และสิ่งตกค้าง\n\n### 3. เลี่ยงน้ำร้อนจัดและการปั่นแรง\nเสื้อผ้ามือสองบางชิ้นอาจผ่านการใช้งานมานาน ทำให้เส้นใยมีความบอบบางมากกว่าผ้าใหม่ การใช้น้ำร้อนหรือการปั่นหมาดด้วยรอบสูงอาจทำให้ตะเข็บปริแตกหรือผ้าเสียรูปทรงได้ แนะนำให้ใส่ถุงถนอมผ้าและเลือกโหมดถนอมผ้า (Delicate Wash)\n\n### 4. ตากในที่ร่ม ลมโกรก ไม่ตากแดดจัด\nแสงแดดที่แรงเกินไปเป็นตัวการสำคัญที่ทำให้สีของเสื้อผ้าซีดจางและเส้นใยกรอบหักง่าย ควรตากในบริเวณที่มีลมถ่ายเทสะดวกและกลับด้านในออกเพื่อถนอมสีผ้าให้สดใสเสมอ\n\n### 5. เก็บรักษาในตู้ที่แห้งและโปร่ง\nแขวนเสื้อผ้าด้วยไม้แขวนเสื้อที่มีขนาดพอดีกับช่วงไหล่ เพื่อไม่ให้เสื้อผ้าเสียทรง และควรใส่ถุงดูดความชื้นในตู้เสื้อผ้าเพื่อป้องกันการเกิดเชื้อราและกลิ่นอับ`,
    coverImage:
      "https://images.unsplash.com/photo-1582735689369-4fe89db7114c?w=1200&h=800&q=80&fit=crop",
    category: "care",
    status: "published",
    authorId: "40000000-0000-0000-0000-000000000001",
    authorName: "ฝ่ายการตลาด RE-LOOP",
    publishedAt: new Date(),
  },
  {
    id: "art-02",
    title: "เทคนิค Mix & Match เสื้อผ้าวินเทจให้ดูโมเดิร์น ไม่ตกยุค",
    summary:
      "ไอเดียการจับคู่เสื้อผ้ามือสองยุค 90s และ Y2K เข้ากับไอเทมยุคปัจจุบัน สร้างลุคสุดเท่ที่เป็นเอกลักษณ์ในงบประมาณที่ทุกคนจับต้องได้",
    content: `เสน่ห์ของเสื้อผ้าวินเทจคือลวดลาย คัตติ้ง และเรื่องราวเฉพาะตัวที่หาไม่ได้ในเสื้อผ้า Fast Fashion สมัยใหม่ แต่ถ้าแต่งตัวด้วยไอเทมวินเทจทั้งตัวตั้งแต่หัวจรดเท้า บางครั้งอาจทำให้ดูเหมือนกำลังใส่ชุดคอสตูมย้อนยุค วันนี้เรามีทริคง่ายๆ ในการจับคู่เสื้อผ้าวินเทจให้ดูชิคและร่วมสมัยมาแนะนำครับ\n\n### 1. กฎทอง One Vintage Piece per Outfit\nสำหรับผู้เริ่มต้น แนะนำให้เลือกชิ้นวินเทจเป็น **Statement Piece** เพียงชิ้นเดียวในแต่ละลุค เช่น หากใส่แจ็คเก็ตยีนส์โอเวอร์ไซส์ยุค 90s ให้จับคู่กับเสื้อยืดสีพื้นเรียบๆ และกางเกงสแล็คทรงโมเดิร์น จะช่วยขับให้แจ็คเก็ตดูโดดเด่นโดยไม่ดูล้น\n\n### 2. เล่นกับสัดส่วน (Proportion Play)\nเสื้อผ้าวินเทจมักมีซิลูเอทที่น่าสนใจ เช่น ไหล่กว้าง ทรงหลวม หรือเอวสูง ลองจับคู่เสื้อเชิ้ตลายวินเทจทรงหลวมกับกางเกงขายาวทรงกระบอกตรงเข้ารูป หรือใส่เสื้อยืดวินเทจพอดีตัวกับกางเกงคาร์โก้ทรงหลวม เพื่อสร้างสมดุลของสัดส่วน\n\n### 3. เติมเต็มด้วยรองเท้าและเครื่องประดับร่วมสมัย\nรองเท้าผ้าใบมินิมอล แว่นตากันแดดทรงทันสมัย หรือกระเป๋าทรงเรขาคณิต จะช่วยดึงลุคโดยรวมให้ดูสดใหม่และเข้ากับยุคปัจจุบันทันที\n\n### 4. ช้อปอย่างมั่นใจบน RE-LOOP\nค้นหาเสื้อผ้าวินเทจและเสื้อผ้ามือสองที่คัดสภาพดีได้ง่ายๆ ผ่านระบบฟิลเตอร์ค้นหาตามสไตล์ และฟีเจอร์ปัดดู (Swipe) เพื่อเซฟลุคที่คุณชอบไว้ในตู้เสื้อผ้าออนไลน์ของคุณ!`,
    coverImage:
      "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=1200&h=800&q=80&fit=crop",
    category: "styling",
    status: "published",
    authorId: "40000000-0000-0000-0000-000000000001",
    authorName: "ฝ่ายการตลาด RE-LOOP",
    publishedAt: new Date(),
  },
  {
    id: "art-03",
    title:
      "Circular Fashion คืออะไร? ทำไมการซื้อเสื้อผ้ามือสองถึงช่วยกู้โลกได้จริง",
    summary:
      "เจาะลึกวิกฤตขยะสิ่งทอและผลกระทบของ Fast Fashion พร้อมร่วมเป็นส่วนหนึ่งของโมเดลเศรษฐกิจหมุนเวียนเพื่อความยั่งยืนผ่านแพลตฟอร์ม RE-LOOP",
    content: `คุณรู้หรือไม่ว่า อุตสาหกรรมแฟชั่นปล่อยก๊าซเรือนกระจกคิดเป็นเกือบ 10% ของการปล่อยก๊าซทั้งหมดของโลก และการผลิตเสื้อยืดคอตตอนเพียง 1 ตัว ต้องใช้น้ำมากถึง 2,700 ลิตร ซึ่งเพียงพอต่อการดื่มของมนุษย์คนหนึ่งได้นานถึงเกือบ 3 ปี!\n\n### วิกฤตการณ์ Fast Fashion และขยะสิ่งทอ\nวัฒนธรรมการซื้อไวทิ้งไวทำให้เสื้อผ้ามากกว่า 85% ถูกนำไปฝังกลบหรือเผาทำลายในแต่ละปี เสื้อผ้าบางตัวถูกสวมใส่เพียงไม่กี่ครั้งก่อนถูกลืมไว้ก้นตู้เสื้อผ้า\n\n### Circular Fashion: ปิดลูปเพื่อความยั่งยืน\n**Circular Fashion (แฟชั่นหมุนเวียน)** คือแนวคิดในการออกแบบ ผลิต และใช้งานเสื้อผ้าให้คงอยู่ในระบบเศรษฐกิจให้นานที่สุด โดยมีหัวใจสำคัญคือ:\n* **Reuse (ใช้ซ้ำ):** ส่งต่อเสื้อผ้าสภาพดีให้ผู้อื่นนำไปใส่ต่อ\n* **Repair (ซ่อมแซม):** บำรุงรักษาเสื้อผ้าที่มีตำหนิเล็กน้อยให้กลับมาใช้งานได้\n* **Recycle & Upcycle (แปรรูป):** นำเศษผ้าที่หมดอายุการใช้งานไปรีไซเคิลเป็นเส้นใยใหม่\n\n### ผลกระทบเชิงบวกจากการยืดอายุเสื้อผ้า\nผลการวิจัยระบุว่า **การยืดอายุการใช้งานของเสื้อผ้าออกไปเพียง 9 เดือน จะช่วยลด Carbon Footprint, ปริมาณการใช้น้ำ และขยะสิ่งทอได้มากถึง 20-30%**\n\n### มาร่วมหมุนเวียนแฟชั่นไปด้วยกันกับ RE-LOOP\nRE-LOOP ถูกสร้างขึ้นมาเพื่อเป็นศูนย์กลางการซื้อขายและแลกเปลี่ยนเสื้อผ้ามือสองที่โปร่งใส ปลอดภัย และใช้งานง่าย ให้คุณเปลี่ยนเสื้อผ้าล้นตู้เป็นรายได้ และค้นพบสไตล์ใหม่ในราคาที่คุ้มค่า มาร่วมสร้างอนาคตแฟชั่นที่ยั่งยืนไปพร้อมกันนะครับ!`,
    coverImage:
      "https://images.unsplash.com/photo-1532453288672-3a27e9be9efd?w=1200&h=800&q=80&fit=crop",
    category: "sustainability",
    status: "published",
    authorId: "40000000-0000-0000-0000-000000000001",
    authorName: "ฝ่ายการตลาด RE-LOOP",
    publishedAt: new Date(),
  },
];

function inferDemoBrand(product) {
  const searchable =
    `${product.title} ${(product.tags || []).join(" ")}`.toLowerCase();
  const knownBrands = [
    ["Levi's", ["levi's", "levis", "501"]],
    ["Uniqlo", ["uniqlo"]],
    ["Converse", ["converse"]],
    ["Nike", ["nike", "airzoom", "air zoom"]],
    ["Adidas", ["adidas"]],
  ];
  return (
    knownBrands.find(([, aliases]) =>
      aliases.some((alias) => searchable.includes(alias)),
    )?.[0] || ""
  );
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
    const productWithBrand = {
      ...product,
      brand: product.brand || inferDemoBrand(product),
    };
    const { photos: photoSet, ...fields } = productWithBrand;
    await prisma.product.upsert({
      where: { id: product.id },
      // An explicit reset may refresh catalog fixtures; normal bootstrap preserves sales.
      update:
        process.env.RELOOP_RESEED_DEMO === "1"
          ? {
              ...fields,
              photos: { deleteMany: {}, create: photoSet.create },
            }
          : {},
      create: productWithBrand,
    });
  }
  // Upgrade only the known shared demo URLs; retain custom photos and all
  // listing fields, including sold/reserved status, on normal bootstrap.
  for (const [index, product] of EXTRA_PRODUCTS.entries()) {
    const legacyPhotos = photos(
      EXTRA_PRODUCT_GROUPS[Math.floor(index / 6)].photoId,
    );
    for (const legacyPhoto of legacyPhotos.create) {
      const replacement = product.photos.create.find(
        (photo) => photo.position === legacyPhoto.position,
      );
      await prisma.photo.updateMany({
        where: {
          productId: product.id,
          position: legacyPhoto.position,
          url: legacyPhoto.url,
        },
        data: { url: replacement.url },
      });
    }
  }

  // Articles search_text trigger (ST-MKT-05 / UR-14 / FR-5.2.3)
  await prisma.$executeRaw`
    CREATE OR REPLACE FUNCTION articles_set_search_text() RETURNS trigger AS $$
    BEGIN
      NEW.search_text := concat_ws(' ',
        NEW.title, coalesce(NEW.summary, ''), NEW.content, NEW.category, coalesce(NEW.author_name, '')
      );
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `;
  await prisma.$executeRaw`
    CREATE OR REPLACE TRIGGER articles_search_text_trigger
    BEFORE INSERT OR UPDATE ON articles
    FOR EACH ROW EXECUTE FUNCTION articles_set_search_text();
  `;

  for (const article of DEMO_ARTICLES) {
    const searchText =
      `${article.title} ${article.summary || ""} ${article.content} ${article.category} ${article.authorName}`.trim();
    await prisma.article.upsert({
      where: { id: article.id },
      update:
        process.env.RELOOP_RESEED_DEMO === "1"
          ? {
              ...article,
              searchText,
            }
          : {},
      create: {
        ...article,
        searchText,
      },
    });
  }

  console.log(
    `[product-service] seeded ${CATEGORIES.length} categories, ${CONDITIONS.length} conditions, ${PRODUCTS.length} demo products across ${Object.keys(SELLER).length} stores, ${DEMO_VIDEOS.length} demo review clips, ${DEMO_ARTICLES.length} demo articles`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
