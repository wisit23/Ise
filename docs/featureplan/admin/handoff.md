# Admin Feature Handoff

> อัปเดตล่าสุด: 2026-08-10

## Ownership

- Owner: สิรดนัย กันหา
- Reviewer: อชิรวินท์ จรูญกีรติโรจน์
- Requirement scope: `UR-22`–`UR-26`
- Current status: Planning revised - implementation not started

## Scope to hand off

- `ADM-001`: Multi-Role Permission Foundation
- `ADM-002`: Test-KYC Review Queue
- `ADM-003`: Reports, User Suspension and Product Moderation
- `ADM-004`: Dispute Evidence and Simulated Fund Hold
- `ADM-005`: Extended Safe Operations

## Current evidence

- Requirement traceability และ acceptance steps อยู่ใน [`plan.md`](plan.md)
- สถานะล่าสุดและขอบเขตที่ยังไม่ยืนยันอยู่ใน [`progress.md`](progress.md)
- ประวัติการเปลี่ยนแปลงอยู่ใน [`changelog.md`](changelog.md)
- บทเรียนจากการตรวจ admin flow อยู่ใน [`teachme.md`](teachme.md)
- ข้อตกลงที่มีผลกับ Feature นี้อยู่ใน [`decision.md`](decision.md)
- ยังไม่มี Feature implementation, migration หรือ PostgreSQL integration test ใหม่ที่ยืนยันว่า Done
- Pulled Auth demo Seller seed เป็น development fixture เท่านั้น ไม่ใช่ KYC/RBAC acceptance
- Access token มี trusted `displayName` สำหรับ downstream attribution แล้ว แต่ไม่ใช่ multi-role/RBAC completion

## Dependencies and contracts

- เป็นเจ้าของ Auth/RBAC contract ที่ทุก Feature ใช้งาน
- ใช้ Seller/Product, Buyer/Order และ Customer Service/Chat contracts สำหรับ moderation และ dispute
- KYC เป็น synthetic/test flow และ fund hold เป็น simulation; decision/audit state ต้อง persist ใน PostgreSQL จริง
- API shape, state และ merge gate ต้องตรงกับ [`../integration.md`](../integration.md)

## Resume from here

1. ยืนยัน Gate 0 และ permission/state catalog กับตัวแทนทุก Role
2. เริ่ม `ADM-001` ก่อน Feature ที่พึ่งพา permission contract
3. รัน targeted test และ PostgreSQL integration test โดยห้าม skip
4. อัปเดต `progress.md`, append `changelog.md` และเพิ่ม `teachme.md` เมื่อมีหลักฐานจริง
5. ขอ Reviewer ตรวจ acceptance evidence ก่อนเปลี่ยนสถานะเป็น Done

## Required handoff evidence

- Branch/commit และรายการไฟล์ที่เปลี่ยน
- Task ID และ UR/FR/NFR/Workflow ที่ครอบคลุม
- คำสั่งทดสอบ ผลลัพธ์ และวันที่รัน
- Migration/schema change และ recovery note ถ้ามี
- Blocker, งานที่ยังไม่เสร็จ และ next action ที่ทำต่อได้ทันที
