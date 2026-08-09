# Marketing Feature Changelog

## 2026-07-30 — Planning Round 0

- Trace `UR-08`–`UR-16`
- กำหนด Campaign CRUD/approval/conversion เป็น Core
- กำหนด segmentation/content/auction/swipe เป็น Extended
- ไม่มี application code ถูกเปลี่ยน

## 2026-08-10 — Traceability and Database Acceptance Revision

- เพิ่ม explicit rows `UR-08`–`UR-16` พร้อม FR, NFR, Workflow และ Task/Phase
- เพิ่ม PostgreSQL acceptance สำหรับ Campaign, approval/publish, Order attribution,
  segment/content และ auction/bid data
- ยืนยัน Conversion จาก persisted completed attributed Orders ไม่ใช่ click fixture
- ระบุ `UR-11` ไม่มี FR Swipe เฉพาะ และ `UR-10` ไม่มี Workflow ประมูลเฉพาะใน Req Doc
- ย้าย production authorization/privacy/push security hardening ไป Deferred Security Phase
- สถานะยังเป็น Planning revised; ไม่มี Marketing implementation/database change ในรอบนี้

## 2026-08-10 — Handoff and Decision Records

- เพิ่ม `handoff.md` สำหรับส่งต่อ `MKT-001`–`MKT-005`, dependency และ acceptance evidence
- เพิ่ม `decision.md` สำหรับ Vertical ownership, Campaign ownership, attribution contract และ deferred security decisions
- ไม่มี Marketing implementation/database change ในรายการนี้

## 2026-08-10 — Post-Pull `UR-11` Reconciliation

- พบ Product-owned video feed และ `/swipe` UI ใน source ที่ pull มา แต่ยังไม่มี persisted choose action
- คง Marketing `MKT-005` เป็น requirement owner, Seller/Product เป็น provider และ Buyer เป็น consumer
- ปรับ plan, progress, handoff และ decision ให้แยก source baseline ออกจาก `UR-11` acceptance
- Campaign, Attribution และ Auction ยังคงไม่มี implementation/acceptance evidence จาก pull นี้
- ไม่ได้แก้ Marketing application code หรือรัน Marketing PostgreSQL acceptance test
