# Buyer Feature Teach Me

## Round 0 — Request flow ที่มีอยู่

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

Source ที่ pull มาทำ flow `GET /api/products/videos/feed → /swipe → Product detail` ได้แล้ว
แต่ยังไม่เก็บว่าผู้ซื้อเลือก/ปัดอะไร ดังนั้นมันเป็น discovery feed baseline ไม่ใช่ completed
Buyer choice journey

**Teach-back:** ต้องเพิ่ม state หรือ event อะไรจึงจะพิสูจน์ “choose” ได้โดยไม่เดาความหมายแทน Req Doc?

## Round 2 — แยก UI component เพื่ออ่านง่ายและลดงาน browser

`page.js` ดูแลเฉพาะ fetch/loading/error ส่วน `SwipeFeedViewer` ดูแล active index/navigation และ
`SwipeVideoCard` ดูแล video/product link คลิปที่ไม่ active จะ pause และ preload แค่ metadata

**Teach-back:** เหตุใดการ render วิดีโอ 20 ตัวแล้ว autoplay ทุกตัวจึงแพงกว่าเล่นเฉพาะ active card?

## Round 3 — Hybrid Search ใช้คะแนนคนละชนิดร่วมกัน

ข้อมูลสินค้าถูกเตรียมเป็นสองรูปแบบ: `search_vector` สำหรับค้นคำและถ่วงน้ำหนัก Field กับ
`search_text` สำหรับค้น substring/ความคล้ายของตัวอักษร เมื่อผู้ใช้ค้น ระบบจะ Match ด้วย FTS,
`ILIKE` หรือ Trigram อย่างน้อยหนึ่งทาง แล้วรวมคะแนน `65% FTS + 35% Trigram` พร้อมโบนัสเมื่อ
ข้อความตรงอยู่ใน `title`

FTS ทำให้ `nike running` ในชื่อสินค้ามีน้ำหนักสูงกว่าคำเดียวกันที่อยู่เฉพาะ description ส่วน
Trigram และ `ILIKE` ยังจำเป็นสำหรับคำพิมพ์ผิดและภาษาไทยที่ PostgreSQL `simple` config ตัดคำไม่ได้

**Teach-back:** เพราะเหตุใดระบบนี้จึงไม่ควรเปลี่ยนเป็น PostgreSQL FTS ล้วนเมื่อข้อมูลสินค้ามีภาษาไทย และ Weight A–D ช่วยให้ Ranking ดีขึ้นอย่างไร?

## Round 4 — Reservation token สำคัญกว่าสถานะ `reserved` อย่างเดียว

การเช็คแล้วเขียนแบบ `GET available → PATCH reserved` มีช่องให้ผู้ซื้อสองคนอ่านค่าเดิมพร้อมกัน
ระบบจึงเปลี่ยนเป็นคำสั่งเขียนเดียวที่สำเร็จเมื่อสินค้ายัง `available` หรือ reservation เดิมหมดอายุ
เท่านั้น จำนวนแถวที่แก้ได้จึงเป็นผู้ตัดสินว่าใครชนะ

ตอน release/confirm ต้องตรวจ `reservationId` และ `buyerId` ด้วย เพราะสถานะ `reserved` อย่างเดียว
ไม่บอกว่าเป็นการจองรอบไหน หาก request รอบเก่ามาช้า มันจะไม่สามารถปลดล็อกของผู้ซื้อรอบใหม่ได้

**Teach-back:** ถ้า buyer A หมดเวลาแล้ว buyer B จองต่อ เหตุใดคำสั่ง release ของ A จึงต้องมี
`reservationId` แทนที่จะตรวจเพียง `status = reserved`?
