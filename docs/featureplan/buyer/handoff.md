# Buyer Feature Handoff

> อัปเดตล่าสุด: 2026-08-10

## Ownership

- Owner: วิศิษฏ์ เจียมสันต์
- Reviewer: เอกตระการ บุญญกาศ
- Requirement scope: `UR-01`–`UR-07`
- Current status: Swipe consumer refactor verified locally; Buyer plan acceptance incomplete

## Scope to hand off

- `BUY-001`: Catalog Search and Filters
- `BUY-002`: Atomic 10-Minute Reservation and Cart
- `BUY-003`: Mock Checkout and Fulfillment Tracking
- `BUY-004`: Seller Trust, Review and Contact Entry
- `BUY-005`: Extended Discovery

## Current evidence

- Requirement traceability และ acceptance steps อยู่ใน [`plan.md`](plan.md)
- สถานะล่าสุดและขอบเขตที่ยังไม่ยืนยันอยู่ใน [`progress.md`](progress.md)
- ประวัติการเปลี่ยนแปลงอยู่ใน [`changelog.md`](changelog.md)
- บทเรียนจากการตรวจระบบเดิมอยู่ใน [`teachme.md`](teachme.md)
- ข้อตกลงที่มีผลกับ Feature นี้อยู่ใน [`decision.md`](decision.md)
- `/swipe` แยก viewer/card, มี empty/error/product-link tests และ active-video playback แล้ว
- ยังไม่มี persisted choose action, PostgreSQL acceptance หรือ Marketing contract approval

## Dependencies and contracts

- ใช้ Product/ProductVideo contract จาก Seller/Product สำหรับ catalog, reservation และ Swipe feed
- เป็นเจ้าของ Buyer/Order journey และส่ง Order data ให้ Seller, Customer Service, Admin และ Executive
- Mock Payment ต้อง deterministic แต่ `PaymentAttempt` และสถานะ Order ต้องบันทึกใน PostgreSQL จริง
- API shape, state และ merge gate ต้องตรงกับ [`../integration.md`](../integration.md)

## Resume from here

1. ยืนยัน Gate 0, Product/Order state mapping และ Swipe semantics กับ Seller, Marketing และ Admin
2. เริ่ม `BUY-001` ตาม test-first steps ใน `plan.md`
3. รัน targeted test และ PostgreSQL integration test โดยห้าม skip
4. อัปเดต `progress.md`, append `changelog.md` และเพิ่ม `teachme.md` เมื่อมีหลักฐานจริง
5. ขอ Reviewer ตรวจ acceptance evidence ก่อนเปลี่ยนสถานะเป็น Done

## Required handoff evidence

- Branch/commit และรายการไฟล์ที่เปลี่ยน
- Task ID และ UR/FR/NFR/Workflow ที่ครอบคลุม
- คำสั่งทดสอบ ผลลัพธ์ และวันที่รัน
- Migration/schema change และ recovery note ถ้ามี
- Blocker, งานที่ยังไม่เสร็จ และ next action ที่ทำต่อได้ทันที
