# RE-LOOP Combined Feature Changelog

> ไฟล์นี้เป็นประวัติแบบ append-only สถานะล่าสุดอยู่ที่ [`progress.md`](progress.md)

## 2026-07-30 — Planning Round 0

- อนุมัติการแบ่งงานแบบ Vertical Feature ตามผู้สัมภาษณ์ 6 Role
- สร้าง Feature ownership, Core/Extended scope, reviewer pairing และ Integration Gate
- แยกเอกสารรวมและเอกสารราย Feature เป็น `plan.md`, `progress.md`, `changelog.md`,
  `teachme.md`
- ตรวจ source ปัจจุบันก่อนตั้งสถานะ; ไม่ยก prototype เดิมเป็น Done
- ไม่มี application code, database หรือ runtime configuration ถูกเปลี่ยนในรอบนี้

## 2026-08-10 — Requirement Traceability Revision

- ยืนยันแผนแบบ 6 Vertical Role Features และ coverage `UR-01` ถึง `UR-39`
- เพิ่ม explicit traceability `UR -> FR -> NFR -> Workflow -> Task/Phase` ในทุก Role plan
- เพิ่ม Phase 0 Foundation, Core, Core Integration, Extended และ Deferred Security Phase
- จำกัด Mock เฉพาะ deterministic Payment provider behavior และ Synthetic KYC content
- กำหนดให้ Feature persistence และ acceptance tests ใช้ Prisma/PostgreSQL จริง;
  mock/in-memory database ไม่ใช่หลักฐานรับงาน
- บันทึก Req Doc gaps: `UR-11` ไม่มี FR เฉพาะ Swipe และ `UR-39` ไม่มี Workflow ประมูลเฉพาะ
- อัปเดต root/role `progress.md` เป็น `Planning revised - implementation not started`
- เพิ่ม design record ที่
  `docs/superpowers/specs/2026-08-10-reloop-role-feature-plan-traceability-design.md`
- ไม่มี application code, Prisma schema, database หรือ runtime configuration ถูกเปลี่ยนในรอบนี้

## 2026-08-10 — Feature Handoff and Decision Records

- เพิ่ม `handoff.md` และ `decision.md` ให้ Buyer, Seller, Customer Service, Admin, Marketing
  และ Executive
- กำหนดให้ handoff ระบุ Owner/Reviewer, scope, evidence, dependencies, next steps และหลักฐานที่ต้องส่งต่อ
- บันทึก accepted/deferred decisions ราย Feature แบบ append-only โดยไม่ใช้แทน `progress.md` หรือ `changelog.md`
- อัปเดต `README.md` ให้อธิบายหน้าที่ของเอกสารทั้งหกชนิด
- ไม่มี application code, Prisma schema, database หรือ runtime configuration ถูกเปลี่ยนในรอบนี้
