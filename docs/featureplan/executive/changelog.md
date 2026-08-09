# Executive Feature Changelog

## 2026-07-30 — Planning Round 0

- Trace `UR-27`–`UR-31`
- กำหนด read-only KPI/monthly/top-category เป็น Core
- กำหนด alert/export/drill-down เป็น Extended
- ไม่มี application code ถูกเปลี่ยน

## 2026-08-10 — Traceability and Database Acceptance Revision

- เพิ่ม explicit rows `UR-27`–`UR-31` พร้อม FR, NFR, `WF-12` และ Task/Phase
- เพิ่ม PostgreSQL acceptance สำหรับ metric facts, rankings, persisted alert state และ export jobs
- ห้ามใช้ hardcoded dashboard, client-only Seller calculation หรือ mock/in-memory database เป็นหลักฐาน
- คง Core metrics/dashboard/rankings และ Extended alert/export ordering
- ย้าย production Executive authorization และ alert/audit security hardening ไป Security Phase
- สถานะยังเป็น Planning revised; ไม่มี Executive implementation/database change ในรอบนี้

## 2026-08-10 — Handoff and Decision Records

- เพิ่ม `handoff.md` สำหรับส่งต่อ `CEO-001`–`CEO-005`, dependency และ acceptance evidence
- เพิ่ม `decision.md` สำหรับ Vertical ownership, read-only analytics, owner-local aggregate และ deferred security decisions
- ไม่มี Executive implementation/database change ในรายการนี้

## 2026-08-10 — Post-Pull Source Audit

- ProductVideo/feed และ demo seed ที่ pull มาไม่เพิ่ม Executive metrics, aggregate API, alert หรือ export
- Executive status, blocker และ `CEO-001` next action ยังคงเดิม
- ไม่ได้แก้ Executive application code หรือรัน Executive PostgreSQL acceptance test
