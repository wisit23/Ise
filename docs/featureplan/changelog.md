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

## 2026-08-10 — Buyer BUY-002 Atomic Reservation and Cart

- เพิ่ม Product-side atomic reservation อายุ 10 นาที, reservation-scoped release/complete และ startup expiry worker
- เพิ่ม Order persistence สำหรับ `reservationId`/`reservationExpiresAt`, retry deduplication และ failed-write compensation
- เปลี่ยน Order ใหม่เป็น `pending_payment` โดยยังอ่าน legacy `pending` ได้ และเพิ่ม Cart countdown/expired guard
- รัน `REQUIRE_INTEGRATION=1` กับ PostgreSQL 16 แยก Product/Order schema: concurrency, retry,
  expired takeover, stale release และ process-restart recovery ผ่าน
- ผลตรวจรวม: backend 47/47, frontend 7/7, lint, secret scan, Prisma validation และ frontend build ผ่าน
- Schema apply เฉพาะ disposable database; ไม่มี deploy หรือ shared/production database change

## 2026-09-02 — UI-SYSTEM-001 Design Token, UI Primitive Layer และการสลาย God Component

- ปลด Quality Gate ที่เสียอยู่ก่อน: เพิ่ม `.prettierrc` (`endOfLine: "auto"`) แก้ปัญหา
  `core.autocrlf=true` บน Windows ที่ทำให้ `format:check` Fail 249 ไฟล์ แล้วพบว่ามี 56 ไฟล์
  ที่ไม่ได้ Format จริง — **CI แดงอยู่บน `main`** จัดการด้วย `npm run format`; เพิ่ม `.agent/`,
  `.claude/`, `.github/skills/` เข้า eslint ignores (เดิมทำให้ `npm run lint` ขึ้น 6,672 error
  ในเครื่องพัฒนา ส่วน CI ไม่เห็นเพราะไม่ได้ commit ไดเรกทอรีเหล่านี้)
- เพิ่ม Design Token (brand / semantic / surface / line / ink) ที่ `frontend/app/globals.css`
  แบบ channel triplet แล้ว map เข้า `tailwind.config.js` เพื่อให้ opacity modifier ใช้ได้
  จงใจไม่มี Token ที่เทียบเท่า `gray-400` เพราะไม่ผ่าน WCAG AA
- เพิ่มฟอนต์ไทย Noto Sans Thai ผ่าน `next/font` (self-host ตอน build) และย้าย Material Symbols
  จาก `useEffect` ที่ inject `<link>` ซ้ำ 4 ไฟล์ มาประกาศครั้งเดียวใน `app/layout.js`
- สร้าง UI Primitive Layer ที่ `frontend/components/ui/`: `Button`, `Input`/`Select`/`Textarea`/
  `Field`, `Modal`, `ConfirmDialog`, `ToastProvider`/`useToast`, `Alert`, `EmptyState`,
  `ErrorState`, `Skeleton`, `DataTable` — ไม่เพิ่ม Runtime Dependency ใหม่
- แทนที่ Dialog ของเบราว์เซอร์ทั้งหมด: `alert()` 4 จุด → Toast, `window.confirm` 1 จุด และ
  `window.prompt` 2 จุด → `ConfirmDialog` ที่ตรวจเหตุผลแบบ inline ได้ ไม่บล็อกทั้งแท็บ และ
  ไม่ทิ้งข้อความที่พิมพ์ไปแล้วเมื่อกดพลาด
- สลาย God Component: `AdminInboxSection` 887→338, `DisputesSection` 789→240,
  `TicketsSection` 542→188, `seller/onboarding` 431→207, `seller/dashboard` 428→239
  โดยยก Markup ที่ Tickets กับ Admin Inbox ใช้ร่วมกัน (~250 บรรทัด) ไปไว้ที่
  `support/sections/case/` — `CaseUserCard` แสดงปุ่มตักเตือน/แบนเฉพาะเมื่อผู้เรียกส่ง Handler
  มาให้ CS จึงเห็นการ์ดเดียวกันโดยไม่มีปุ่มที่จะ 403
- ยกระดับ Contrast 37 ไฟล์: `text-gray-400` (2.85:1) และ `text-slate-400` (2.6:1) → ระดับ
  `-500` (4.8:1); ยกเว้นหน้า `/swipe` ที่โทนเดียวกันอยู่บนพื้นดำและถูกต้องอยู่แล้ว
- แทนที่ `.catch(() => {})` 9 จุดที่กลืน Error เงียบๆ ด้วยการ log พร้อมบริบท และเพิ่ม
  `ErrorState` ให้หน้าแรกและหน้ารายการสินค้า (เดิม Backend ดับ = หน้าว่างเปล่า ไม่มีคำอธิบาย)
- เพิ่ม Skeleton และ EmptyState ที่มี Action ให้หน้าแรก, รายการสินค้า, ตะกร้า, คำสั่งซื้อ,
  แดชบอร์ดผู้ขาย และตารางใน Backoffice
- บั๊กจริงที่เจอระหว่างทางและแก้แล้ว: ไอคอน NavBar 2 จุดหายไปตั้งแต่ `d98e8a1` (เป็น span ว่าง),
  `Modal` เปิดอยู่ใต้ Case Drawer เพราะ z-index ไม่ได้กำหนดลำดับไว้, Focus trap ของ `Modal`
  ตายจริงเพราะกรองด้วย `offsetParent !== null` บน panel ที่อยู่ใน `position:fixed`,
  Drop zone อัปโหลดบัตรประชาชนเป็น `<div onClick>` ที่คีย์บอร์ดเข้าไม่ถึง, Spinner ใน Disputes
  อ้าง keyframe `spin` ที่ไม่มีจริงใน CSS ของโปรเจกต์
- บั๊กฝั่ง Backend ที่พบแต่ **ยังไม่แก้**: Admin เห็นและ Action ตั๋วจาก Queue ได้ แต่
  GET `/api/support/tickets/:id` ตอบ 403 สำหรับตั๋วใบเดียวกัน ทำให้หลังตักเตือนสำเร็จมี
  ข้อความ "you do not have access to this ticket" ขึ้นใต้ Toast ที่บอกว่าสำเร็จ — ฝั่ง UI ไม่แสดง
  แล้ว แต่ความไม่สอดคล้องของสิทธิ์ยังอยู่
- ผลตรวจ: `npm run lint` ผ่าน, `npm run format:check` ผ่าน, `npm run test:frontend` 37/37
  (เพิ่มใหม่ 9 tests), `next build` สำเร็จ และทดสอบผ่าน Browser จริงกับ Docker Stack
  (postgres, gateway, auth, product, order, support) ด้วย Demo Admin และ Demo Seller
- กติกาสำหรับคนที่มาต่อ: `docs/ui-conventions.md`
- ไม่มี Prisma schema, database migration หรือ backend logic ถูกเปลี่ยนในรอบนี้

## UI-BUYER-002 — Reveal Animation, แถวคำสั่งซื้อที่มีรูป, เมนูหมวดหมู่, แดชบอร์ดสมมาตร (2026-09-02)

- เพิ่ม `Reveal` (Scroll-into-view), `Menu`/`MenuItem`/`MenuLabel` (Dropdown ที่ใช้ซ้ำได้),
  `OrderLine`/`ProductThumb`, `useDismissable`, `lib/products.js`
- แถบบน: "สินค้าทั้งหมด" → "สินค้า" เปิดเป็น Dropdown หมวดหมู่ที่มีของจริงพร้อมจำนวน;
  ปุ่ม "ลงขาย" ได้กรอบคืนและลด Padding
- ตะกร้าและคำสั่งซื้อเลิกวาดแถวของตัวเอง มาใช้ `OrderLine` ที่มีรูปสินค้า สภาพ ไซซ์
  หมวด ทำเล และจัดเป็น 3 คอลัมน์ให้ราคา/ปุ่มตรงกันทั้งรายการ
- `ChartCard`/`KpiCard` ยืดเต็มแถว Grid — แก้ที่ Primitive เดียว ครอบคลุมทั้ง 4 แดชบอร์ด
- Hero หน้าแรกมีพื้นและเส้นปิดของตัวเอง แยกโซนจาก Section ด้านล่าง
- ผลตรวจ: `lint` ผ่าน, `format:check` ผ่าน, Frontend test 37/37, `next build` สำเร็จ,
  ตรวจบน Browser จริงกับ Docker Stack ทั้ง `/`, `/cart`, `/orders`, `/executive`
