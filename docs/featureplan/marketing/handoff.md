# Marketing Feature Handoff

> อัปเดตล่าสุด: 2026-08-10

## Ownership

- Owner: ศิวกร วรวัฒน์อมรชัย
- Reviewer: อัสนัย เมืองรอด
- Requirement scope: `UR-08`–`UR-16`
- Current status: Plan acceptance not started; pulled Swipe baseline audited

## Scope to hand off

- `MKT-001`: Campaign Domain and Lifecycle
- `MKT-002`: Review, Preview and Publish Workspace
- `MKT-003`: Attribution and Conversion Dashboard
- `MKT-004`: Extended Segmentation and Content
- `MKT-005`: Extended Auction and Swipe Contracts

## Current evidence

- Requirement traceability และ acceptance steps อยู่ใน [`plan.md`](plan.md)
- สถานะล่าสุดและขอบเขตที่ยังไม่ยืนยันอยู่ใน [`progress.md`](progress.md)
- ประวัติการเปลี่ยนแปลงอยู่ใน [`changelog.md`](changelog.md)
- บทเรียนจากการตรวจ campaign flow อยู่ใน [`teachme.md`](teachme.md)
- ข้อตกลงที่มีผลกับ Feature นี้อยู่ใน [`decision.md`](decision.md)
- Pulled source มี video feed/Swipe UI แต่ยังไม่มี Campaign/Auction หรือ persisted Swipe-to-Choose acceptance

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
