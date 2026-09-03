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

## Round 3 — Reservation ต้องล็อกด้วย write เดียว ไม่ใช่ check แล้วค่อย update

Flow ใหม่คือ `Order → Product reservation CAS → Order PostgreSQL` Product ใช้ `updateMany` ที่เขียน
`available → reserved` ได้เมื่อแถวยังว่างหรือ reservation เดิมหมดอายุเท่านั้น ดังนั้น Buyer สองคนที่ยิง
พร้อมกันจะมีเพียงคนเดียวที่ update ได้ ส่วน Order เก็บ `reservationId` เดียวกันไว้เป็นหลักฐานเชื่อมข้าม service

ถ้า Order write ล้มเหลว ระบบเรียก release ด้วยทั้ง `productId + reservationId`; ถ้ามี Buyer คนใหม่จองต่อแล้ว
release เก่าจะ update ไม่โดนแถว จึงไม่ปลด lock ของคนใหม่ Worker อ่าน expiry จาก PostgreSQL ตอน process start
และทุก 30 วินาที ทำให้ restart แล้วข้อมูลเวลาจองไม่หาย

**Teach-back:** เพราะเหตุใด `UPDATE product SET status='available' WHERE id=?` จึงอันตรายกว่า
`UPDATE ... WHERE id=? AND reservation_id=?` เมื่อมี retry หรือ worker ทำงานพร้อมกัน?
