# Customer Service Feature Handoff

> อัปเดตล่าสุด: 2026-08-10

## Ownership

- Owner: อชิรวินท์ จรูญกีรติโรจน์
- Reviewer: สิรดนัย กันหา
- Requirement scope: `UR-17`–`UR-21`
- Current status: Planning revised - implementation not started

## Scope to hand off

- `CSS-001`: Participant-Safe Chat
- `CSS-002`: Support Order Lookup and Case Queue
- `CSS-003`: Return and Simulated Refund Decision
- `CSS-004`: Extended FAQ and SLA

## Current evidence

- Requirement traceability และ acceptance steps อยู่ใน [`plan.md`](plan.md)
- สถานะล่าสุดและขอบเขตที่ยังไม่ยืนยันอยู่ใน [`progress.md`](progress.md)
- ประวัติการเปลี่ยนแปลงอยู่ใน [`changelog.md`](changelog.md)
- บทเรียนจากการตรวจ support flow อยู่ใน [`teachme.md`](teachme.md)
- ข้อตกลงที่มีผลกับ Feature นี้อยู่ใน [`decision.md`](decision.md)
- ยังไม่มี Feature implementation, migration หรือ PostgreSQL integration test ใหม่ที่ยืนยันว่า Done
- Post-pull audit ไม่พบ Chat/Support source delta; handoff scope และ next action ยังคงเดิม

## Dependencies and contracts

- เป็นเจ้าของ Chat และ support case data ที่ Buyer, Seller และ Admin ใช้งาน
- ใช้ Buyer/Order contract สำหรับค้น Order, dispute และ simulated refund decision
- การคืนเงินรอบนี้เป็น simulation; decision/case/audit state ต้อง persist ใน PostgreSQL จริง
- API shape, state และ merge gate ต้องตรงกับ [`../integration.md`](../integration.md)

## Resume from here

1. ยืนยัน Gate 0 และ Chat/Order/Case state mapping กับ Buyer และ Admin
2. เริ่ม `CSS-001` ตาม test-first steps ใน `plan.md`
3. รัน targeted test และ PostgreSQL integration test โดยห้าม skip
4. อัปเดต `progress.md`, append `changelog.md` และเพิ่ม `teachme.md` เมื่อมีหลักฐานจริง
5. ขอ Reviewer ตรวจ acceptance evidence ก่อนเปลี่ยนสถานะเป็น Done

## Required handoff evidence

- Branch/commit และรายการไฟล์ที่เปลี่ยน
- Task ID และ UR/FR/NFR/Workflow ที่ครอบคลุม
- คำสั่งทดสอบ ผลลัพธ์ และวันที่รัน
- Migration/schema change และ recovery note ถ้ามี
- Blocker, งานที่ยังไม่เสร็จ และ next action ที่ทำต่อได้ทันที
