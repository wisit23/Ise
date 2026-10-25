# Executive Feature Handoff

## 2026-10-25 — Continued audit handoff

ดู [`production-audit-2026-10-25.md`](production-audit-2026-10-25.md) สำหรับรายการแก้และผลตรวจล่าสุด: Frontend 233 tests, Backend 57 tests (รวม PostgreSQL integration, ไม่มี skip), scoped ESLint/Prettier และ production build ผ่าน ต้อง deploy Auth/Order ร่วมกันสำหรับ service-token-only `POST /executive/seller-search` ใหม่ และ build Frontend ไม่มี schema/migration ใหม่จากรอบนี้ โค้ดใหม่ของ audit ยังไม่ได้ stage/commit; ไม่แตะ index ที่มีงานเดิมค้างอยู่

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

> อัปเดตล่าสุด: 2026-10-25 (ตรวจสอบระดับ Production, แก้ไข Status Counts ตามคำค้นหา, ลบ Dead Code, แยก executiveDates.js, รันเทสผ่าน 100%)

## Ownership

- Owner: อัสนัย เมืองรอด
- Reviewer: ศิวกร วรวัฒน์อมรชัย
- Requirement scope: `UR-27`–`UR-31`
- Current status: `CEO-001`–`CEO-003` implemented and database-verified; `CEO-004` not delivered
  (CEO-DEC-011); `CEO-005` delivered as rescoped: CSV export + audit log (CEO-DEC-016) — see
  [`progress.md`](progress.md)

## Scope to hand off

- `CEO-001`: Metric Definitions and Provider Endpoints
- `CEO-002`: Executive Dashboard and Comparisons
- `CEO-003`: Top Products and Categories
- `CEO-004`: Extended Anomaly Alerts — in scope but not delivered before the deadline (CEO-DEC-011)
- `CEO-005`: CSV Export with Audit Log (rescoped from CSV/PDF export jobs, CEO-DEC-016)

## Current evidence

- Requirement traceability และ acceptance steps อยู่ใน [`plan.md`](plan.md)
- สถานะล่าสุดและขอบเขตที่ยังไม่ยืนยันอยู่ใน [`progress.md`](progress.md)
- ประวัติการเปลี่ยนแปลงอยู่ใน [`changelog.md`](changelog.md)
- บทเรียนจากการตรวจ analytics flow อยู่ใน [`teachme.md`](teachme.md)
- ข้อตกลงที่มีผลกับ Feature นี้อยู่ใน [`decision.md`](decision.md)
- `CEO-001`–`CEO-003` มี implementation + PostgreSQL integration test ที่รันผ่านจริงแล้ว
  (`REQUIRE_INTEGRATION=1`) — หลักฐานล่าสุด 2026-10-24 ใน [`progress.md`](progress.md)
- หน้าข้อร้องเรียนรวมข้อร้องเรียน/Ticket/ข้อพิพาท พร้อมตัวกรองและหน้าต่างรายละเอียด
  (CEO-DEC-014, CEO-DEC-015); หน้าภาพรวมมีช่วงเวลา วันนี้ (ค่าเริ่มต้น)/เดือนนี้/ปีนี้/กำหนดเอง (ตั้งแต่–ถึง, CEO-DEC-018)
- Index ตามเวลา: auth `20261024100000_executive_time_indexes` (`login_logs.login_at`, `users.created_at`, `reports.reported_at`), order `20261024100000_executive_order_time_index` (`orders(created_at, status)`), support `20261024100000_executive_ticket_time_index` (`support_tickets.created_at`) — ต้องรัน
  `prisma migrate deploy` ของ 3 service นี้ตอน deploy
- `CEO-004` ยังอยู่ใน scope แต่ไม่ได้ส่งมอบทันกำหนด (CEO-DEC-011): มีแค่คำเตือนร้องเรียนซ้ำที่คำนวณตอนเรียก
- `CEO-005` rescope แล้ว (CEO-DEC-016): ดาวน์โหลด CSV จากหน้ารายงาน และบันทึกทุกครั้งใน audit log
  (`REPORT_EXPORT_CSV`); ไม่มี export job/วันหมดอายุ/PDF ตามที่ Owner ตัดสินใจ

## Dependencies and contracts

- ใช้ owner-local aggregate จาก Buyer/Order, Seller/Product และ Marketing/Campaign
- Dashboard เป็น read-only และต้องแสดง unavailable/partial state เมื่อ provider ใช้งานไม่ได้
- ห้ามอ่าน database ของ service อื่นโดยตรงหรือสร้างเลขศูนย์แทนข้อมูลที่หาไม่ได้
- API shape, state และ merge gate ต้องตรงกับ [`../integration.md`](../integration.md)

## Resume from here

1. ขอ Reviewer ตรวจ acceptance evidence ของ `CEO-001`–`CEO-003` และ `CEO-005` (rescoped)
2. ยังเปิดอยู่ (ไม่บล็อกการส่งงาน): ตรวจหน้าจอมือถือของ 3 แท็บ; ให้ gateway ปฏิเสธ
   `/internal/` (ตอนนี้มี token ภายในกันอยู่ — ไฟล์กลาง ต้องคุยทีมก่อน)
3. เก็บไว้ก่อนตามที่ Owner ตัด: `CEO-004` (CEO-DEC-011), ดาวของ Ticket, หมวดหมู่ของ report,
   หน้าดู audit log
4. แจ้งทีม auth: `POST /internal/users/display-names` ส่ง `staffRoles` เพิ่ม (เพิ่ม field
   อย่างเดียว, ผู้เรียกเดิมใช้แค่ `userId`/`displayName`)

## Required handoff evidence

- Branch/commit และรายการไฟล์ที่เปลี่ยน
- Task ID และ UR/FR/NFR/Workflow ที่ครอบคลุม
- คำสั่งทดสอบ ผลลัพธ์ และวันที่รัน
- Migration/schema change และ recovery note ถ้ามี
- Blocker, งานที่ยังไม่เสร็จ และ next action ที่ทำต่อได้ทันที
