# Buyer Feature Changelog

## 2026-07-30 — Planning Round 0

- Trace `UR-01`–`UR-07` ไปยัง Core/Extended tasks
- ตรวจพบ Buyer prototype เดิม แต่ยังไม่รับเป็น Done
- ไม่มี application code ถูกเปลี่ยน

## 2026-08-10 — Traceability and Database Acceptance Revision

- เพิ่ม explicit rows `UR-01`–`UR-07` พร้อม FR, NFR, `WF-02`–`WF-07` และ Task/Phase
- กำหนด `BUY-001`–`BUY-005` เป็น Buyer vertical slices โดยคง Seller/CS provider boundaries
- เพิ่ม PostgreSQL acceptance สำหรับ catalog, reservation concurrency, Order, PaymentAttempt,
  Review, style profile และ wishlist
- ยืนยัน deterministic Mock Payment และห้าม mock/in-memory database
- ย้าย Security hardening ไป Deferred Security Phase
- สถานะยังเป็น Planning revised; ไม่มี Buyer implementation/database change ในรอบนี้

## 2026-08-10 — Handoff and Decision Records

- เพิ่ม `handoff.md` สำหรับส่งต่อ `BUY-001`–`BUY-005`, dependency และ acceptance evidence
- เพิ่ม `decision.md` สำหรับ Vertical ownership, Mock Payment, reservation และ deferred security decisions
- ไม่มี Buyer implementation/database change ในรายการนี้
