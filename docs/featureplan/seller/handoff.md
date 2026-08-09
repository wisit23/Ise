# Seller Feature Handoff

> อัปเดตล่าสุด: 2026-08-10

## Ownership

- Owner: เอกตระการ บุญญกาศ
- Reviewer: วิศิษฏ์ เจียมสันต์
- Requirement scope: `UR-32`–`UR-39`
- Current status: Plan acceptance not started; pulled ProductVideo provider baseline audited

## Scope to hand off

- `SEL-001`: Synthetic KYC Submission
- `SEL-002`: Listing and Media Workspace
- `SEL-003`: Inventory and Shipping Actions
- `SEL-004`: Server-Side Seller Insights
- `SEL-005`: Extended Seller Tools

## Current evidence

- Requirement traceability และ acceptance steps อยู่ใน [`plan.md`](plan.md)
- สถานะล่าสุดและขอบเขตที่ยังไม่ยืนยันอยู่ใน [`progress.md`](progress.md)
- ประวัติการเปลี่ยนแปลงอยู่ใน [`changelog.md`](changelog.md)
- บทเรียนจากการตรวจ listing flow อยู่ใน [`teachme.md`](teachme.md)
- ข้อตกลงที่มีผลกับ Feature นี้อยู่ใน [`decision.md`](decision.md)
- Pulled source มี ProductVideo provider/upload baseline แต่ KYC และ Seller plan acceptance ยังไม่ผ่าน

## Dependencies and contracts

- Synthetic KYC ใช้ข้อมูลทดสอบเท่านั้น แต่ `KycApplication` และผลพิจารณาต้องอยู่ใน Auth PostgreSQL จริง
- เป็นเจ้าของ Seller/Product และ ProductVideo provider contract ที่ Buyer, Marketing และ Admin ใช้งาน
- ใช้ Buyer/Order contract สำหรับ inventory, shipping และ seller insight
- API shape, state และ merge gate ต้องตรงกับ [`../integration.md`](../integration.md)

## Resume from here

1. ยืนยัน Gate 0, KYC/Product/Order state mapping และ ProductVideo contract กับ Admin, Buyer และ Marketing
2. เริ่ม `SEL-001` ตาม test-first steps ใน `plan.md`
3. รัน targeted test และ PostgreSQL integration test โดยห้าม skip
4. อัปเดต `progress.md`, append `changelog.md` และเพิ่ม `teachme.md` เมื่อมีหลักฐานจริง
5. ขอ Reviewer ตรวจ acceptance evidence ก่อนเปลี่ยนสถานะเป็น Done

## Required handoff evidence

- Branch/commit และรายการไฟล์ที่เปลี่ยน
- Task ID และ UR/FR/NFR/Workflow ที่ครอบคลุม
- คำสั่งทดสอบ ผลลัพธ์ และวันที่รัน
- Migration/schema change และ recovery note ถ้ามี
- Blocker, งานที่ยังไม่เสร็จ และ next action ที่ทำต่อได้ทันที
