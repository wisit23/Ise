# Customer Service Feature Decision Log

> รายการนี้เป็น append-only; หากเปลี่ยนคำตัดสินให้เพิ่มรายการใหม่และอ้างถึงรายการเดิม

## CSS-DEC-001 — Vertical Customer Service ownership

- Date: 2026-08-10
- Status: Accepted
- Decision: Customer Service Owner รับผิดชอบ `UR-17`–`UR-21` แบบ vertical ตั้งแต่ UI, API, Chat/Case rules, PostgreSQL tests และเอกสาร
- Reason: ทำให้ support journey ตั้งแต่สนทนาถึงตัดสินเคสมี Owner เดียว
- Consequence: Order และ Admin command contracts ยังต้อง review ร่วมกับ Buyer และ Admin

## CSS-DEC-002 — Chat and case data use real PostgreSQL

- Date: 2026-08-10
- Status: Accepted
- Decision: Chat message, participant, support case และ decision state ต้อง persist ใน PostgreSQL จริง
- Reason: ต้องตรวจ authorization, ordering และ recovery หลัง restart ได้
- Consequence: In-memory chat/case repository ใช้เป็น acceptance evidence ไม่ได้

## CSS-DEC-003 — Refund is simulated

- Date: 2026-08-10
- Status: Accepted
- Decision: การตัดสินคืนเงินในรอบนี้เป็น simulation และไม่มี external money movement
- Reason: สอดคล้องกับ Mock Payment boundary ของ Buyer
- Consequence: ต้องบันทึก decision, reason, audit trail และ Order transition ตาม contract แม้ไม่มีเงินจริง

## CSS-DEC-004 — Security hardening deferred

- Date: 2026-08-10
- Status: Deferred
- Decision: Security/abuse/PII hardening แยกไปทำหลัง Core และ Extended behavior
- Reason: ขอบเขตรอบปัจจุบันเน้น functional Feature และ database-backed acceptance
- Consequence: ห้ามรายงาน security NFR ว่า Done ในรอบนี้
