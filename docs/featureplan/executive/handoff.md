# Executive Feature Handoff

## 2026-10-10 — Complaint feature handoff / pre-Git recheck

- Scope: complaint details with Report/Audit/User action data, full-page modal,
  realtime target/shop search, status ALL, pagination, validation and error/retry.
  Trust & Safety write commands and database schemas are unchanged.
- Frontend source includes the new ComplaintDetailsModal, ComplaintRow,
  executiveComplaints validator and useExecutiveComplaints hook. Backend source
  includes reportConfig/reportSearch and new query/persistence tests. Include
  all new files in the commit; committing tracked diffs alone is insufficient.
- Optional config keys are documented in root .env.example. NEXT_PUBLIC_REPORT_*
  values are embedded at frontend build time; production Compose forwards them
  as build args. Real .env files stay local and ignored by Git.
- Recheck fixes: recover to the last valid page when reports leave a selected
  status; use Map for target/actor lookup to avoid inherited object properties.
- Latest focused evidence: frontend 41/41; isolated PostgreSQL/query/config checks
  3/3; scoped lint, Prettier and strict API-validator type check passed; tracked
  plus nine new files passed secret scans. New browser QA was not performed.
- Previously recorded whole-role acceptance remains separate from this change.
- Final build evidence: frontend production build succeeded on an isolated copy;
  auth-service Docker build succeeded. Temporary test schemas/runners were removed.

> อัปเดตล่าสุด: 2026-08-26

## Ownership

- Owner: อัสนัย เมืองรอด
- Reviewer: ศิวกร วรวัฒน์อมรชัย
- Requirement scope: `UR-27`–`UR-31`
- Current status: `CEO-001`–`CEO-003` implemented and database-verified; `CEO-004`/`CEO-005`
  partially delivered — see [`progress.md`](progress.md) for the exact scope boundary

## Scope to hand off

- `CEO-001`: Metric Definitions and Provider Endpoints
- `CEO-002`: Executive Dashboard and Comparisons
- `CEO-003`: Top Products and Categories
- `CEO-004`: Extended Anomaly Alerts
- `CEO-005`: Extended CSV/PDF Export

## Current evidence

- Requirement traceability และ acceptance steps อยู่ใน [`plan.md`](plan.md)
- สถานะล่าสุดและขอบเขตที่ยังไม่ยืนยันอยู่ใน [`progress.md`](progress.md)
- ประวัติการเปลี่ยนแปลงอยู่ใน [`changelog.md`](changelog.md)
- บทเรียนจากการตรวจ analytics flow อยู่ใน [`teachme.md`](teachme.md)
- ข้อตกลงที่มีผลกับ Feature นี้อยู่ใน [`decision.md`](decision.md)
- `CEO-001`–`CEO-003` มี implementation + PostgreSQL integration test ที่รันผ่านจริงแล้ว
  (`REQUIRE_INTEGRATION=1`, 49 passed / 0 skipped) — รายละเอียดใน [`progress.md`](progress.md)
- `CEO-004`/`CEO-005` ยังไม่ครบตาม acceptance เดิม: ไม่มี persisted alert state และไม่มี
  persisted export job/expiry — ห้ามรายงานว่า Done จนกว่าจะทำเพิ่มหรือ rescope อย่างเป็นทางการ

## Dependencies and contracts

- ใช้ owner-local aggregate จาก Buyer/Order, Seller/Product และ Marketing/Campaign
- Dashboard เป็น read-only และต้องแสดง unavailable/partial state เมื่อ provider ใช้งานไม่ได้
- ห้ามอ่าน database ของ service อื่นโดยตรงหรือสร้างเลขศูนย์แทนข้อมูลที่หาไม่ได้
- API shape, state และ merge gate ต้องตรงกับ [`../integration.md`](../integration.md)

## Resume from here

1. ยืนยัน Gate 0 และนิยาม KPI/ช่วงเวลากับ Buyer, Seller และ Marketing
2. เริ่ม `CEO-001` ตาม test-first steps ใน `plan.md`
3. รัน targeted test และ PostgreSQL integration test โดยห้าม skip
4. อัปเดต `progress.md`, append `changelog.md` และเพิ่ม `teachme.md` เมื่อมีหลักฐานจริง
5. ขอ Reviewer ตรวจ acceptance evidence ก่อนเปลี่ยนสถานะเป็น Done

## Required handoff evidence

- Branch/commit และรายการไฟล์ที่เปลี่ยน
- Task ID และ UR/FR/NFR/Workflow ที่ครอบคลุม
- คำสั่งทดสอบ ผลลัพธ์ และวันที่รัน
- Migration/schema change และ recovery note ถ้ามี
- Blocker, งานที่ยังไม่เสร็จ และ next action ที่ทำต่อได้ทันที
