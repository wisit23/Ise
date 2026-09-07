# Buyer Feature Handoff

> อัปเดตล่าสุด: 2026-09-07

## Ownership

- Owner: วิศิษฏ์ เจียมสันต์
- Reviewer: เอกตระการ บุญญกาศ
- Requirement scope: `UR-01`–`UR-07`; Buyer เป็น consumer ของ Swipe `UR-11` ภายใต้ Marketing contract
- Current status: `BUY-001` และ `BUY-002` verified locally with PostgreSQL; `BUY-004` และ Swipe subset ของ `BUY-005` implemented บางส่วน; overall Buyer acceptance ยังเปิด

## Scope to hand off

- `BUY-001`: Catalog Search and Filters — implemented และ verified locally
- `BUY-002`: Atomic 10-Minute Reservation and Cart — implemented และ verified locally, pending Reviewer acceptance
- `BUY-003`: Mock Checkout and Fulfillment Tracking — ยังไม่มี explicit state table, `PaymentAttempt` หรือ deterministic/idempotent Mock Payment
- `BUY-004`: Seller Trust, Review and Contact Entry — review/list/summary/media implemented; Contact Seller และ cross-service acceptance ยังขาด
- `BUY-005`: Extended Discovery — Swipe feed/choose/navigation implemented บางส่วน; wishlist, style profile และ recommendation ยังขาด

## Current evidence

- Committed feature evidence: `1696bb8` เพิ่ม review list บน Product/Storefront และ `30fb8e0`
  เพิ่ม review image/video schema/UI. Swipe touch/keyboard fix และ review-owned storage separation
  ยังอยู่ใน working tree ณ handoff นี้; ยังไม่ใช่ shipped/merged evidence.
- `BUY-001`: PostgreSQL catalog query รองรับ category, persisted style tags, brand, size, condition,
  price range และ hybrid Full-Text/Trigram search; forced PostgreSQL catalog test ผ่าน 1/1.
- `BUY-002`: Product reservation ใช้ atomic compare-and-set, expiry 10 นาที, reservation-scoped
  release, startup expiry worker, Order retry/compensation และ Cart countdown; PostgreSQL concurrency/
  expiry/recovery evidence เคยผ่านตาม `changelog.md`.
- `BUY-004`: `review-service` ตรวจ authenticated buyer กับ Order และอนุญาตเฉพาะ `completed`;
  `orderId` unique, Product detail/Storefront แสดง seller rating และรายการรีวิวแบบแบ่งหน้า, Orders
  สร้าง/อ่านรีวิวของ Buyer และแนบรูปหรือวิดีโอได้.
- Review media ใหม่อัปโหลดผ่าน `POST /api/reviews/uploads`, อ่านจาก `/review-uploads/*` และอยู่ใน
  Docker volume `review_uploads`; Product media ยังคงอยู่ใน `product_uploads`. URL รีวิวเดิม
  `/uploads/*` ยังไม่ถูก migrate.
- Swipe ใช้ public `GET /api/products/videos/feed`, persisted bookmark ผ่าน
  `POST /api/products/videos/:id/choose`, เล่นเฉพาะ active video และรองรับ touch/keyboard navigation.
- Latest focused evidence: review/gateway 15/15, frontend 47/47, frontend build, targeted ESLint,
  Compose config และ Docker build review-service/gateway ผ่าน.
- Root backend suite ล่าสุดยังไม่ green: Order checkout integration 2 รายการเกิด
  `PrismaClientInitializationError` เมื่อ database ไม่ได้รัน; ห้ามใช้รอบนี้อ้าง full backend acceptance.

## Dependencies and contracts

- ใช้ Product/ProductVideo contract จาก Seller/Product สำหรับ catalog, reservation, product media และ Swipe feed
- Review metadata/file lifecycle เป็นของ review-service; Product และ Review ห้ามเขียน volume เดียวกัน
- Buyer/Order journey ส่ง Order data ให้ Seller, Customer Service, Admin และ Executive
- Swipe choose เป็น bookmark ตาม `MKT-DEC-006`; ไม่ใช่ Bid และไม่สร้าง Order
- Mock Payment ต้อง deterministic แต่ `PaymentAttempt` และสถานะ Order ต้อง persist ใน PostgreSQL จริง
- API shape, state และ merge gate ต้องตรงกับ [`../integration.md`](../integration.md)

## Resume from here

1. รัน forced cross-service/PostgreSQL acceptance ของ `BUY-004`: completed-order create, forged buyer `403`, duplicate `409`, media persistence และ restart read-back
2. เพิ่ม Contact Seller/create-or-open chat entry เพื่อปิดส่วนที่เหลือของ `BUY-004`
3. ทำ `BUY-003` explicit order state table และ deterministic/idempotent Mock Payment พร้อม `PaymentAttempt`
4. เพิ่ม SwipeChoice contract/PostgreSQL tests, Buyer-only role enforcement และ chosen-state read-back แล้วทำ wishlist, style profile และ recommendation เพื่อปิด `BUY-005`
5. วาง migration แยกสำหรับ review URL เดิม `/uploads/*` เฉพาะเมื่อมีข้อมูลจริงที่ต้องย้าย
6. Reviewer ตรวจ evidence และเปลี่ยนสถานะเฉพาะ slice ที่ผ่าน database gate แล้ว

## Required handoff evidence

- Branch/commit และรายการไฟล์ที่เปลี่ยน
- Task ID และ UR/FR/NFR/Workflow ที่ครอบคลุม
- คำสั่งทดสอบ ผลลัพธ์ วันที่รัน และจำนวน pass/fail/skip
- Migration/schema/volume change และ recovery note ถ้ามี
- Blocker, งานที่ยังไม่เสร็จ และ next action ที่ทำต่อได้ทันที
