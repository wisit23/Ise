# Admin Feature Changelog

## 2026-07-30 — Planning Round 0

- Trace `UR-22`–`UR-26`
- กำหนด Admin เป็น owner ของ shared RBAC contract และ privileged audit
- ไม่มี application code ถูกเปลี่ยน

## 2026-08-10 — Traceability and Database Acceptance Revision

- เพิ่ม explicit rows `UR-22`–`UR-26` พร้อม FR, NFR, `WF-01`, `WF-08`, `WF-09` และ Task/Phase
- คง `ADM-001` เป็น Phase 0 functional role provider ของทั้ง 6 Features
- เพิ่ม PostgreSQL acceptance สำหรับ KYC decision, report/moderation และ simulated fund hold
- คง Mock fund/payment state และ Synthetic KYC boundary; ห้าม mock/in-memory database
- ย้าย production privileged audit, encryption, PDPA และ PCI-DSS hardening ไป Security Phase
- สถานะยังเป็น Planning revised; ไม่มี Admin implementation/database change ในรอบนี้

## 2026-08-10 — Handoff and Decision Records

- เพิ่ม `handoff.md` สำหรับส่งต่อ `ADM-001`–`ADM-005`, dependency และ acceptance evidence
- เพิ่ม `decision.md` สำหรับ Vertical ownership, shared RBAC, synthetic/simulated boundary และ deferred security decisions
- ไม่มี Admin implementation/database change ในรายการนี้
