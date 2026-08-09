# Customer Service Feature Changelog

## 2026-07-30 — Planning Round 0

- Trace `UR-17`–`UR-21`
- กำหนด Order lookup, support chat และ dispute เป็น Core
- ไม่มี application code ถูกเปลี่ยน

## 2026-08-10 — Traceability and Database Acceptance Revision

- เพิ่ม explicit rows `UR-17`–`UR-21` พร้อม FR, NFR, `WF-06`, `WF-08`, `WF-10` และ Task/Phase
- เพิ่ม Chat Prisma/PostgreSQL setup เป็นส่วนของ `CSS-001`
- เพิ่ม PostgreSQL acceptance สำหรับ Room, Message, SupportCase, evidence/refund decision,
  FAQ revision และ SLA timestamp
- คง simulated refund/payment boundary และห้าม mock/in-memory database
- ย้าย production staff-access/audit hardening ไป Deferred Security Phase
- สถานะยังเป็น Planning revised; ไม่มี Customer Service implementation/database change ในรอบนี้

## 2026-08-10 — Handoff and Decision Records

- เพิ่ม `handoff.md` สำหรับส่งต่อ `CSS-001`–`CSS-004`, dependency และ acceptance evidence
- เพิ่ม `decision.md` สำหรับ Vertical ownership, real Chat/Case DB, simulated refund และ deferred security decisions
- ไม่มี Customer Service implementation/database change ในรายการนี้
