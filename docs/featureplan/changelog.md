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

## 2026-08-10 — Post-Pull Source Reconciliation

- ตรวจ merge จาก upstream commits `19db46c` และ `9a11682`; เก็บ `docs/progress.md`
  ฝั่ง upstream เพราะมีหลักฐาน `MOCK-TRADE-008` และ `MOCK-TRADE-009` เพิ่มเข้ามา
- ตรวจ source ของ `ProductVideo`, seller video upload, public Swipe feed, demo Seller seed และ tests
- กำหนด source ดังกล่าวเป็น baseline ของ Seller/Product provider, Buyer consumer และ Marketing
  `UR-11` requirement owner โดยยังไม่ยกเป็น Feature Done
- บันทึกช่องว่าง: ไม่มี persisted choose action, feed filter ยังรวม `reserved`/`sold` และ
  `sellerName` มาจาก request body
- อัปเดต root/role plan, progress, handoff, decision, integration และ teachme ที่ได้รับผลกระทบ
- ตรวจรอบนี้: lint ผ่าน, frontend 2 tests ผ่าน, backend หลัง generate Prisma client ผ่าน 30
  และ skip database tests 3; Compose config ผ่าน แต่ไม่มี project container ทำงาน
- Secret scan ผ่าน 177 tracked files และ frontend production build ผ่านรวม `/swipe` กับ
  `/seller/videos/new`; ยังมี warning ว่าไม่ได้ตั้ง Next.js ESLint plugin
- ไม่ได้รัน `REQUIRE_INTEGRATION=1` หรือ Docker/browser E2E และ host Node 24 อยู่นอก engine ที่กำหนด
- ไม่มี application code, Prisma schema หรือ runtime configuration ถูกแก้โดยรอบเอกสารนี้

## 2026-08-10 — ProductVideo and Swipe Targeted Refactor

- แยก ProductVideo เป็น `route -> controller -> service -> repository -> Prisma` เพื่อให้ flow และ
  responsibility อ่านตามได้ง่าย โดยคง endpoint และ response shape เดิม
- จำกัด public video feed ให้แสดงเฉพาะ Product สถานะ `available` และเพิ่ม Prisma index ที่
  `ProductVideo.createdAt`; ยังไม่ได้ apply schema กับ PostgreSQL จริง
- เปลี่ยน seller display name ให้มาจาก signed JWT claim ที่ Auth สร้างจาก User ในฐานข้อมูล และไม่เชื่อ
  `sellerName` จาก request body
- แยก `/swipe` เป็น page/viewer/card, เล่นเฉพาะ active video และเพิ่ม empty/error/product-link tests
- เพิ่ม pretest ที่ generate เฉพาะ Prisma client ที่ขาดหรือเก่ากว่า schema
- ตรวจล่าสุด: backend 41 tests (38 ผ่าน, 3 database tests ข้าม, 0 fail), frontend 5/5,
  lint ผ่าน, frontend build ผ่าน และ secret scan พบ 0 จุดใน 177 tracked files
- ยังไม่ได้รัน `REQUIRE_INTEGRATION=1`, apply ProductVideo index, Docker/browser E2E; `UR-11`
  Swipe-to-Choose semantics และ persisted choose action ยังคงเป็น TBD
