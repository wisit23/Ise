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

## 2026-08-10 — Post-Pull Swipe Consumer Audit

- พบ `/swipe` และ public `GET /api/products/videos/feed` ใน source ที่ pull มา
- ยืนยันจาก source ว่าหน้า Swipe เลื่อน feed/เปิด Product ได้ แต่ไม่ persist choose action
- ปรับ `BUY-005`, progress, handoff และ decision ให้ใช้ baseline โดยไม่อ้างว่า `UR-11` Done
- ไม่ได้แก้ Buyer application code หรือรัน Buyer PostgreSQL acceptance test ในรอบเอกสารนี้

## 2026-08-10 — Swipe Consumer Refactor

- แยก `/swipe` เป็น data-loading page, feed viewer และ video card เพื่อให้ junior ไล่ flow ได้ทีละชั้น
- ให้ browser เล่นเฉพาะ active video และ pause video ที่ไม่ active เพื่อลดงาน decode/playback ที่ไม่จำเป็น
- เพิ่ม tests สำหรับ empty feed, trusted seller/product link และ API error; frontend ผ่าน 5/5 และ build ผ่าน
- ยังไม่มี persisted choose action และยังไม่ได้รัน Buyer PostgreSQL acceptance test จึงไม่ยก `UR-11` เป็น Done

## 2026-08-10 — BUY-002 Atomic Reservation and Cart

- เพิ่ม Product reservation fields และ internal contract สำหรับ reserve/release/complete โดยทุก write
  ใช้ `reservationId` เป็น compare-and-set guard
- เปลี่ยน Order create เป็น Product reserve ก่อน แล้ว persist `reservationId`, 10-minute expiry และ
  `pending_payment`; retry ใช้ Order เดิมและ Order write failure มี compensation
- เพิ่ม Product startup worker สำหรับคืน `reserved → available` เมื่อหมดอายุ และ stale release ไม่สามารถ
  ปลด reservation ใหม่ได้
- เพิ่ม Cart countdown, ปิดการเลือก/checkout รายการหมดอายุ และรองรับ legacy `pending` rows ระหว่างเปลี่ยน contract
- PostgreSQL 16 integration ผ่าน concurrency `201/409`, retry, takeover, stale release และ restart recovery;
  backend 47/47, frontend 7/7, lint, secret scan และ frontend build ผ่าน
- Apply schema เฉพาะฐานข้อมูลทดสอบชั่วคราวที่ port `55432`; ยังไม่มี production/deployment change
