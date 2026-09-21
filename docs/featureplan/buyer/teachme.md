# Buyer Feature Teach Me

> อัปเดตล่าสุด: 2026-09-07 · Round เก่าเก็บเป็น historical lesson และมีหมายเหตุเมื่อถูก supersede

## Round 4 — Catalog filters share one PostgreSQL predicate builder

`GET /api/products/search` validates price input first, then sends every filter through
`catalogQuery.buildCatalogWhere`. A style is a normalized value matched against the persisted
`Product.tags` array; therefore `q` ranking remains the existing hybrid trigram search while
all other constraints stay AND conditions. The public predicate always includes `status =
'available'`, including requests without `q`. Forced PostgreSQL 16 catalog acceptance ผ่านแล้ว
เมื่อ 2026-09-05; performance กับ dataset ใหญ่และ Reviewer acceptance ยังแยกจากหลักฐานนี้.

## Round 0 — Request flow ที่มีอยู่

> Historical baseline: ปัญหาตะกร้าด้านล่างถูกแก้โดย Round 3 แล้ว; เก็บข้อความนี้ไว้เพื่ออธิบายเหตุผลของ `BUY-002`.

```text
frontend/app/products/page.js
→ frontend/lib/api.js
→ gateway /api/products
→ productController.search()
→ productModel.list()
→ Prisma
→ reloop_product
```

ตะกร้าปัจจุบันสร้าง Order ก่อนแล้วเรียก Product ให้เป็น `reserved` แบบสองขั้นตอน จึงยังมีช่อง
double-sale/partial failure งาน `BUY-002` ต้องย้าย correctness ไปไว้ใน contract ที่ atomic
หรือ recoverable ไม่แก้ด้วยการซ่อนปุ่มฝั่ง UI

**Teach-back:** ถ้า Order ถูกสร้างแต่ Product lock ล้มเหลว ระบบต้องมี rollback/reconciliation
แบบใด และเหตุใดการเช็ค `available` ก่อนเขียนจึงยังไม่พอ?

## Round 1 — Swipe feed กับ Swipe-to-Choose ไม่ใช่สิ่งเดียวกัน

> Historical baseline; implementation ปัจจุบันมี persisted `SwipeChoice` แล้วตาม Round 7.

Source ที่ pull มา ณ รอบนี้ทำ flow `GET /api/products/videos/feed → /swipe → Product detail` ได้แล้ว
แต่ยังไม่เก็บว่าผู้ซื้อเลือก/ปัดอะไร ดังนั้นตอนนั้นมันเป็น discovery feed baseline ไม่ใช่ completed
Buyer choice journey

**Teach-back:** ต้องเพิ่ม state หรือ event อะไรจึงจะพิสูจน์ “choose” ได้โดยไม่เดาความหมายแทน Req Doc?

## Round 2 — แยก UI component เพื่ออ่านง่ายและลดงาน browser

`page.js` ดูแลเฉพาะ fetch/loading/error ส่วน `SwipeFeedViewer` ดูแล active index/navigation และ
`SwipeVideoCard` ดูแล video/product link คลิปที่ไม่ active จะ pause และ preload แค่ metadata

**Teach-back:** เหตุใดการ render วิดีโอ 20 ตัวแล้ว autoplay ทุกตัวจึงแพงกว่าเล่นเฉพาะ active card?

## Round 3 — Reservation ต้องล็อกด้วย write เดียว ไม่ใช่ check แล้วค่อย update

Flow ใหม่คือ `Order → Product reservation CAS → Order PostgreSQL` Product ใช้ `updateMany` ที่เขียน
`available → reserved` ได้เมื่อแถวยังว่างหรือ reservation เดิมหมดอายุเท่านั้น ดังนั้น Buyer สองคนที่ยิง
พร้อมกันจะมีเพียงคนเดียวที่ update ได้ ส่วน Order เก็บ `reservationId` เดียวกันไว้เป็นหลักฐานเชื่อมข้าม service

ถ้า Order write ล้มเหลว ระบบเรียก release ด้วยทั้ง `productId + reservationId`; ถ้ามี Buyer คนใหม่จองต่อแล้ว
release เก่าจะ update ไม่โดนแถว จึงไม่ปลด lock ของคนใหม่ Worker อ่าน expiry จาก PostgreSQL ตอน process start
และทุก 30 วินาที ทำให้ restart แล้วข้อมูลเวลาจองไม่หาย

**Teach-back:** เพราะเหตุใด `UPDATE product SET status='available' WHERE id=?` จึงอันตรายกว่า
`UPDATE ... WHERE id=? AND reservation_id=?` เมื่อมี retry หรือ worker ทำงานพร้อมกัน?

## Round 5 — Review เป็นความน่าเชื่อถือของ Seller แต่สิทธิ์เริ่มจาก Order

Review ไม่ควรเชื่อ `buyerId`/`sellerId` ที่ browser ส่งมาเอง. Flow ปัจจุบันรับ `orderId` แล้วให้
review-service ถาม order-service ว่าใครเป็น Buyer/Seller และ Order เป็น `completed` หรือยัง จากนั้น
Review database ใช้ unique `orderId` ป้องกันรีวิวซ้ำ. คะแนนจึงเอาไป aggregate ต่อ Seller และแสดงได้
ทั้ง Product detail กับ Storefront โดยยัง trace กลับไปยังการซื้อจริง.

สิ่งที่ implementation มีไม่เท่ากับ acceptance: integration test ปัจจุบันพิสูจน์ aggregate ใน
review database แต่ยังไม่ยิง create flow ข้าม review-service → order-service เพื่อพิสูจน์ forged Buyer,
duplicate `409` และ restart read-back.

**Teach-back:** ทำไมการซ่อนปุ่มรีวิวจากคนที่ไม่ใช่ Buyer ใน frontend ยังไม่พอ ถ้า backend ไม่ตรวจ Order อีกครั้ง?

## Round 6 — แยก media ตามเจ้าของข้อมูล ไม่ใช่ตามชนิดไฟล์

รูปและวิดีโอไม่ได้จำเป็นต้องมี Docker service กลางเสมอไป. สิ่งสำคัญคือ ownership: Product media อยู่
`product-service/product_uploads`; Review media ใหม่อยู่ `review-service/review_uploads`. Browser อัปโหลด
รีวิวผ่าน `POST /api/reviews/uploads` และเก็บ URL `/review-uploads/*` ใน `ReviewPhoto`/`ReviewVideo`.
ทำให้ review-service ควบคุมการเก็บและลบไฟล์ของตัวเองโดยไม่แชร์ writable volume กับ product-service.

URL รีวิวเก่า `/uploads/*` ยังชี้ Product storage จึงต้องมี one-time migration แยก หากมีข้อมูลจริงที่ต้องย้าย;
การเปลี่ยน endpoint อย่างเดียวไม่ย้าย byte หรือแก้ record เก่าให้อัตโนมัติ.

**Teach-back:** ถ้าลบ Review หนึ่งรายการ ส่วนใดควรรับผิดชอบลบไฟล์แนบ และเหตุใดไม่ควรให้สอง service เขียน volume เดียวกัน?

## Round 7 — Gesture, active clip และ persisted choice เป็นคนละ state

การปัดขึ้น/ลงเปลี่ยน `activeIndex` และควบคุมว่า video ตัวไหนเล่น; มันเป็น UI navigation. การกดหัวใจ
เรียก `POST /api/products/videos/:id/choose` และ persist `SwipeChoice`; มันเป็น business state.
ตาม `MKT-DEC-006` choice คือ bookmark ไม่ใช่ Bid. ดังนั้น test ว่าปัดไปคลิปถัดไปได้ยังไม่พิสูจน์ว่า
bookmark ถูกบันทึกใน PostgreSQL และ test API choose ก็ไม่แทนการตรวจ gesture/accessibility. ปัจจุบัน UI
ยังไม่อ่าน chosen state กลับหลัง reload และ service ยังไม่ reject role ที่ไม่ใช่ Buyer จึงมี implementation
สำหรับเขียนแต่ยังไม่มี Buyer journey/read-back contract ครบ.

**Teach-back:** ถ้า touch swipe ผ่านแต่ POST choose ล้มเหลว ผู้ใช้ควรเห็น state ใด และระบบควรถือว่าเลือกสินค้าแล้วหรือยัง?
