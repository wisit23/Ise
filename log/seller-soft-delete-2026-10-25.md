# Seller soft delete — 25 ตุลาคม 2026

ปรับโค้ดตามจุด hard delete ในฟังก์ชัน seller ที่ตรวจพบ และฟังก์ชันบัญชีร่วมที่เกี่ยวข้อง โดยใช้ `deletedAt` / `deleted_at` เก็บเวลาลบแทนการลบแถวจริง

| จุดที่แก้ | พฤติกรรมใหม่ |
| --- | --- |
| ลบสินค้า | บันทึกเวลาลบ เก็บสินค้าและข้อมูลลูกไว้ ตรวจเจ้าของและสถานะก่อนลบแบบ atomic |
| ลบคลิปรีวิว | บันทึกเวลาลบ เก็บความคิดเห็นและการกดสนใจเดิมไว้ |
| ลบคำถามอัตโนมัติ | บันทึกเวลาลบ ปิด `isActive` และไม่นับรายการที่ลบในโควตา 20 ข้อ |
| แก้รูป/วิดีโอสินค้า | ทำ soft delete แถวสื่อเดิมก่อนเพิ่มสื่อชุดใหม่ เก็บประวัติเดิมไว้ |
| แก้หมวดหมู่สินค้า | ทำ soft delete ความสัมพันธ์เดิม ใช้ upsert เมื่อนำหมวดหมู่เดิมกลับมาใช้ เพื่อไม่ชน composite key |
| ลบที่อยู่ | บันทึกเวลาลบ ปิดสถานะที่อยู่หลัก และเลือกที่อยู่ที่ยังไม่ถูกลบเป็นค่าเริ่มต้นแทน |
| ลบแจ้งเตือนส่วนตัว | บันทึกเวลาลบ ไม่นำไปแสดงหรือนับ unread รองรับเอกสาร MongoDB เดิมที่ยังไม่มีฟิลด์นี้ |
| ยกเลิกรายการโปรด/การกดสนใจคลิป | บันทึกเวลาลบ กดใหม่ได้โดยคืนสถานะแถวเดิม ไม่สร้างรายการซ้ำ |

ปรับตัวกรองการอ่านและแก้ไขข้อมูลในรายการขาย ร้านค้า รายละเอียดสินค้า การค้นหา/แนะนำสินค้า ฟีดคลิป รายการโปรด การจอง ประมูล แคมเปญ และตัวเลขที่เกี่ยวข้อง ให้ตัดข้อมูลที่ลบแล้วออก รวมถึงไม่ให้ใช้การแก้ไขหรือแสดงสินค้าเพื่อเปิดใช้งานสินค้าที่ลบแล้วอีกครั้ง

ข้อห้ามเดิมยังอยู่: seller ลบสินค้าที่ขายแล้ว กำลังจอง อยู่ในสถานะประมูล หรือถูกระงับโดยทีมดูแลไม่ได้ ไม่มีการเพิ่มหน้ากู้คืนข้อมูลในงานนี้ การซ่อนสินค้า/ห้องแชตยังใช้พฤติกรรมเดิม

แก้ข้อความยืนยันลบสินค้าให้แจ้งว่าจะนำสินค้าออกจากร้านและรายการขาย

## Schema และ migration

- Product PostgreSQL: เพิ่ม nullable `deleted_at` ใน `products`, `photos`, `videos`, `product_categories`, `product_videos`, `product_favorites`, `swipe_choices` และ index สำหรับรายการ seller
- Auth PostgreSQL: เพิ่ม nullable `deleted_at` ใน `user_addresses`, `auto_messages` และ index สำหรับที่อยู่ของผู้ใช้
- Chat MongoDB: เพิ่ม optional `deletedAt` ใน Prisma model ของ Notification; ตัวกรองรวมทั้ง null และ missing field จึงอ่านข้อมูลเก่าได้โดยไม่ต้อง backfill
- Migration ใหม่ของ product/auth: `20261028000000_seller_soft_delete` เป็นการเพิ่มคอลัมน์/index ไม่มีการลบตารางหรือข้อมูลเดิม
- Generate Prisma clients ใน workspace แล้ว

## ผลตรวจสอบ

- Regression ของ product-service และ auth/chat ส่วนที่แก้: **409 ผ่าน, 0 ล้มเหลว, 0 ข้าม** (`seller-soft-delete-regression.txt`)
- Integration บน PostgreSQL/MongoDB ชั่วคราว: **5 ผ่าน, 0 ล้มเหลว, 0 ข้าม** (`seller-soft-delete-rehearsal.txt`)
- Frontend `SellerProductList.test.js`: **15 ผ่าน**; ทดสอบ auction repository ซ้ำหลังปรับตัวนับรอบประมูล: **3 ผ่าน**
- Integration ครอบคลุมการคงอยู่ของแถวและข้อมูลลูกหลังลบ, ไม่แสดงข้อมูลที่ลบ, ไม่ให้จอง/แก้ไข/เปิดสินค้าที่ลบแล้ว, สิทธิ์เจ้าของ, สถานะห้ามลบ, เปลี่ยนสื่อ/หมวดหมู่, กดรายการโปรด/สนใจซ้ำ, โควตาคำถาม, เลือกที่อยู่หลัก และ MongoDB legacy documents
- ESLint ของไฟล์ JS ที่แก้และสคริปต์ใหม่ผ่าน; `git diff --check` ผ่าน
- ฐานข้อมูลชั่วคราวถูกล้างหลังทดสอบ ไม่ได้เปลี่ยนฐานข้อมูลที่ระบบกำลังใช้งาน

ทดสอบซ้ำโดยใช้ฐานข้อมูล local ที่ตั้งค่าใน `.env`:

```powershell
node scripts/rehearse-seller-soft-delete.cjs
```

สคริปต์ยอมรับเฉพาะ hostname local, สร้างฐานข้อมูลชื่อเฉพาะแต่ละรอบ และลบเฉพาะฐานข้อมูลที่สคริปต์สร้างสำเร็จในรอบนั้น

## การนำไปใช้งาน

**ยังไม่ได้ deploy หรือ apply migration ลงฐานข้อมูลที่ระบบกำลังใช้** ต้อง migrate ก่อนเริ่ม service เวอร์ชันใหม่นี้ ตัวอย่างสำหรับ Docker Compose ของ repository:

```powershell
docker compose build auth-service product-service chat-service frontend
docker compose run --rm --no-deps auth-service npm run migrate:deploy
docker compose run --rm --no-deps product-service npm run migrate:deploy
docker compose up -d auth-service product-service chat-service frontend
```

ขอบเขตนี้เป็นฟังก์ชัน seller และฟังก์ชันบัญชีร่วมที่ระบุข้างต้น ไม่ได้เปลี่ยนการ purge ข้อมูล fixture ใน tests, cleanup ไฟล์อัปโหลดที่ไม่ผ่าน validation, token housekeeping หรือเมนูลบข้อมูลเฉพาะฝ่าย staff ให้เป็น soft delete ทั้งระบบ
