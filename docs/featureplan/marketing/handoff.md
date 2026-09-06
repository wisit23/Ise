# Marketing Feature Handoff

> อัปเดตล่าสุด: 2026-09-06

## Ownership

- Owner: ศิวกร วรวัฒน์อมรชัย
- Reviewer: อัสนัย เมืองรอด
- Requirement scope: `UR-08`–`UR-16`
- Current status: `MKT-005` (Auction Core, Rounds, Soft Close), `UR-11` choose action, และ `MKT-004` Part A (Knowledge Base & Educational Articles System: `UR-14` / `FR-5.2.3`) พัฒนาและทดสอบผ่านครบ 41/41 unit tests และ Next.js build ใน Docker เรียบร้อย

## Scope to hand off

- `MKT-001`: Campaign Domain and Lifecycle
- `MKT-002`: Review, Preview and Publish Workspace
- `MKT-003`: Attribution and Conversion Dashboard
- `MKT-004`: Extended Segmentation and Content (Knowledge Base & Articles System Completed)
- `MKT-005`: Extended Auction and Swipe Contracts (Auction Rounds & Soft Close Completed)

## Current evidence

- Requirement traceability และ acceptance steps อยู่ใน [`plan.md`](plan.md)
- สถานะล่าสุดและขอบเขตที่ยังไม่ยืนยันอยู่ใน [`progress.md`](progress.md)
- ประวัติการเปลี่ยนแปลงอยู่ใน [`changelog.md`](changelog.md)
- บทเรียนจากการตรวจ flow อยู่ใน [`teachme.md`](teachme.md) (Round 1–8)
- ข้อตกลงที่มีผลกับ Feature นี้อยู่ใน [`decision.md`](decision.md) (`MKT-DEC-001`–`MKT-DEC-011`)
- Auction System: แก้ไขบั๊กแยกสินค้าประมูลด้วย `status: "auction"`, ระบบกำหนดรอบประมูลโดย Marketing, การล็อกฟอร์มผู้ขายเมื่อหมดเวลารอบ, การอนุมัติโดย Marketing, ระบบต่อเวลาอัตโนมัติ 5 นาทีสุดท้าย (Soft Close) และ Auto-Fill Min Next Bid ผ่าน Unit Tests 30/30 รายการ
- Knowledge Base & Articles System: Model `Article` ใน PostgreSQL, GIN Trigram index + Trigger `search_text`, Trigram search algorithm (`GREATEST(word_similarity, similarity)` + `ILIKE`), API Public & Marketing, Role-based authorization, หน้า `/articles`, `/articles/:id`, เมนู Navbar, และแท็บ `ArticlesSection` ใน `/marketing` ผ่าน Jest tests (41/41 tests) และ static build (24/24 pages)
- Test Environment: แก้ไขบั๊ก Seed script ใน `auth-service` ไม่ให้ชน Unique constraint บนอีเมล พร้อมบัญชีทดสอบที่พร้อมใช้งานครบทุก Role (`marketing@example.com`, `shop.denim@example.com`, `buyer.demo@example.com`, `admin@example.com` รหัสผ่าน: `password123`)


## Dependencies and contracts

- เป็นเจ้าของ Campaign contract ที่ Buyer และ Executive ใช้งาน
- ใช้ Seller/Product/ProductVideo สำหรับสินค้า/Swipe และ Buyer/Order สำหรับ attribution/conversion
- ห้ามอ่าน database ของ Product หรือ Order โดยตรง; ใช้ provider API/event contract
- API shape, state และ merge gate ต้องตรงกับ [`../integration.md`](../integration.md)

## Resume from here

1. ยืนยัน Gate 0, Campaign/Product/Order contract และ Swipe semantics กับ Seller, Buyer และ Executive
2. เริ่ม `MKT-001` ตาม test-first steps ใน `plan.md`
3. รัน targeted test และ PostgreSQL integration test โดยห้าม skip
4. อัปเดต `progress.md`, append `changelog.md` และเพิ่ม `teachme.md` เมื่อมีหลักฐานจริง
5. ขอ Reviewer ตรวจ acceptance evidence ก่อนเปลี่ยนสถานะเป็น Done

## Required handoff evidence

- Branch/commit และรายการไฟล์ที่เปลี่ยน
- Task ID และ UR/FR/NFR/Workflow ที่ครอบคลุม
- คำสั่งทดสอบ ผลลัพธ์ และวันที่รัน
- Migration/schema change และ recovery note ถ้ามี
- Blocker, งานที่ยังไม่เสร็จ และ next action ที่ทำต่อได้ทันที
