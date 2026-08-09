# Buyer Feature Decision Log

> รายการนี้เป็น append-only; หากเปลี่ยนคำตัดสินให้เพิ่มรายการใหม่และอ้างถึงรายการเดิม

## BUY-DEC-001 — Vertical Buyer ownership

- Date: 2026-08-10
- Status: Accepted
- Decision: Buyer Owner รับผิดชอบ `UR-01`–`UR-07` แบบ vertical ตั้งแต่ UI, API, Order rules, PostgreSQL tests และเอกสาร
- Reason: ลดการรอส่งงานระหว่าง Frontend/Backend/Database และทำให้ตรวจ outcome ได้เป็น Feature
- Consequence: การแก้ Product contract ยังต้อง review ร่วมกับ Seller ซึ่งเป็น provider

## BUY-DEC-002 — Deterministic Mock Payment

- Date: 2026-08-10
- Status: Accepted
- Decision: Checkout ใช้ Mock Payment ที่ให้ผล deterministic และไม่รับเงินจริง
- Reason: รอบนี้ต้องทดสอบ payment journey ได้โดยไม่ผูก external payment provider
- Consequence: `PaymentAttempt`, idempotency และ Order state ต้องบันทึกใน Order PostgreSQL จริง; ห้ามใช้ mock database เป็น acceptance evidence

## BUY-DEC-003 — Atomic reservation window

- Date: 2026-08-10
- Status: Accepted
- Decision: การจองสินค้าต้อง atomic และมีอายุ 10 นาทีตาม Product/Order contract
- Reason: ป้องกันผู้ซื้อหลายคนซื้อสินค้าชิ้นเดียวกันพร้อมกัน
- Consequence: ต้องมี concurrency, expiry และ restart integration tests กับ PostgreSQL จริง

## BUY-DEC-004 — Security hardening deferred

- Date: 2026-08-10
- Status: Deferred
- Decision: Security/PDPA/PCI-DSS hardening แยกไปทำหลัง Core และ Extended behavior
- Reason: ขอบเขตรอบปัจจุบันเน้น functional Feature และ database-backed acceptance
- Consequence: ห้ามรายงาน security NFR ว่า Done ในรอบนี้
