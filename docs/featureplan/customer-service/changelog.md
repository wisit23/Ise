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

## 2026-08-10 — Post-Pull Source Audit

- ไม่พบ Chat, SupportCase, refund decision หรือ SLA implementation เพิ่มในสอง upstream commits
- Customer Service status, blocker และ `CSS-001` next action ยังคงเดิม
- ไม่ได้แก้ Customer Service application code หรือรัน Chat PostgreSQL acceptance test

## 2026-08-25 — Rescope: Ticket-First CS (Chat Deferred)

- เปลี่ยนช่องทางสื่อสารหลักของ CS จาก Live Chat เป็น **Support Ticket Thread** — `WF-10` ทำงานครบวงจร
  ได้ด้วย async thread ส่วน Live Chat เป็นช่องทางเพิ่ม ไม่ใช่ prerequisite (แพทเทิร์นเดียวกับ Zendesk/Jira Service Desk)
- เพิ่ม `CSS-000` (Foundation: `SUPPORT` role, `support-service` ใหม่, Order dispute lifecycle) เป็น hard blocker
- เพิ่ม `CSS-005` (Support Ticket Core) เป็นแกนสื่อสารแทน `CSS-001`
- เลื่อน `CSS-001` (Participant-Safe Live Chat) เป็น Deferred พร้อมบันทึกข้อกำหนดตอนกลับมาทำ
  (ต้อง persist ก่อน broadcast เพราะ `UR-25` ใช้ประวัติแชทเป็นหลักฐานตัดสินข้อพิพาท)
- คงความหมายของ Task ID เดิมทุกตัวเพื่อไม่ให้ cross-reference ใน `buyer/plan.md`, `admin/plan.md`
  และ `featureplan/plan.md` พัง — ลำดับการทำงานจริงย้ายไปอยู่ที่หัวข้อ Execution Order แทน
- ตัดสินใจสร้าง `support-service` แยกใหม่ (ไม่ rename `chat-service`) ตามที่ Owner เลือก
- ย้าย private dispute-evidence storage เข้ามาเป็น Core (`CSS-003`) เพราะพบว่า `gateway/src/app.js`
  allowlist `/uploads/` เป็น public path อยู่ — หลักฐานข้อพิพาทจะเปิดดูได้โดยไม่ต้อง login
- บันทึก Known Risks 5 ข้อ รวมถึง `init-databases.sql` ที่รันเฉพาะตอน cluster init ครั้งแรก
  (ปัญหาประเภทเดียวกับ `MOCK-TRADE-010` ที่เคยทำให้ clone แล้วพัง)
- ยังไม่มี Customer Service implementation หรือ database change ในรอบนี้ — เป็นการวางแผนล้วน

## 2026-08-25 — Core Implementation: CSS-000, CSS-005, CSS-002, CSS-003, CSS-004

- Built `support-service` from scratch (Express + Prisma, `reloop_support`), wired into every
  infra touchpoint (compose, init-databases.sql, env, ensurePrismaClients.js, gateway, CI)
- `SUPPORT` role added; two demo agents seeded
- Order lifecycle extended with `disputed`/`refunded` + `payoutHeld`/`disputedAt`, locked down so only
  the dispute decision flow (not the generic status PATCH) can set them
- Ticket Core: state machine, optimistic-lock assign/transition, internal notes hidden from requesters,
  full audit trail
- Agent order lookup (bounded — no name/email search, order-service doesn't hold that data)
- Dispute flow: atomic payout hold on open, one-way audited decision, evidence in a **private** storage
  directory (never through product-service's public `/uploads/`), every evidence view authorized + logged
- SLA priority/due-date as pure functions; escalation monitor safe under multiple instances
  (conditional `updateMany`, not read-then-write)
- FAQ search reuses the `pg_trgm` pattern from `MOCK-TRADE-011` — Postgres full-text search still can't
  index Thai
- Full frontend: `/help`, `/support/tickets(+[id])`, `/support/queue`, `/support/cases(+[id])`,
  dispute-open UI on `/orders`, NavBar links
- Found and fixed two real bugs only live browser testing caught: a PATCH/POST method mismatch between
  frontend and backend on the decision endpoint (silent 404, no test caught it), and a Docker-Desktop-on-
  Windows bind-mount file-watcher gap where new/edited frontend files needed `docker compose restart
  frontend` to be picked up
- Verified: 67/67 `npm test` (12 new support-service tests, 4 new order-service tests), lint/format clean,
  full round trip through the real browser against the live rebuilt Docker stack — order → dispute open →
  agent decision → order `refunded` + payout released, confirmed by direct Postgres query
- Full evidence table in `progress.md`; scope-revision rationale (why Ticket-first, not Chat-first) in
  `plan.md`

## 2026-08-26 — Consolidate Agent Panel + Dashboard Redesign

- ผู้ใช้ (Owner) รายงานว่าหน้า Agent 2 หน้าที่แยกกัน (`/support/queue`, `/support/cases`) "ไม่สมเหตุสมผล" และอยากให้
  งาน CS ทั้งหมดรวมอยู่ในหน้าเดียวจริงๆ — ลบทั้งสองหน้า สร้าง `/support/panel` แทน เป็น Single-Page ด้วย
  Sidebar Navigation สลับ 4 Section (Tickets/Disputes/Orders/FAQ) โดยไม่ Navigate ออกจากหน้า
- เพิ่ม Section "จัดการ FAQ" ที่ไม่เคยมี Frontend มาก่อนทั้งที่ Backend มี API พร้อมตั้งแต่ `CSS-004`
  (`POST /help`, `PATCH /help/:id/publish`) — เพิ่ม `GET /help/manage` (List ทุก Status สำหรับเจ้าหน้าที่,
  ของเดิมมีแต่ Endpoint Public ที่เห็นแค่ Published)
- ผู้ใช้ส่ง Mockup HTML (Sidebar + Stat Card + Filter Pill + Table Layout) มาให้ยึดเป็นแนวทาง — Redesign
  ทั้ง Tickets และ Disputes Section เป็นโครงสร้างเดียวกัน: Stat Card แถวบน (คำนวณจาก Parallel Fetch
  `limit=1` อ่านแค่ `.total`, ไม่ได้เพิ่ม Backend Endpoint ใหม่), Filter Pill, ช่องค้นหา, ตาราง Sortable-Ready
  พร้อมปุ่ม Action — ใช้ข้อมูลจริงทั้งหมด ไม่ใช่ Static Mockup Data ตามที่ผู้ใช้กำชับ
- เพิ่ม `scope` (`unassigned`/`mine`/`all`) และ `search` (Subject/Ticket Number) เข้า Ticket Queue
  (`ticketModel.listQueue`) ให้ตรงความสามารถกับ Dispute Queue ที่มี `search` อยู่แล้ว
- พบและแก้ Bug ระหว่างเก็บกวาดข้อมูล: `slugify()` ของ FAQ พังกับหัวข้อภาษาไทย (Vowel/Tone Mark เป็น
  Combining Character แยกจาก Consonant, Regex เดิมไม่รู้จัก `\p{M}` เลยตัดข้อความแหลกเป็นเศษๆ) — แก้แล้ว,
  ย้าย Article ที่สร้างทดสอบเข้า `seed.js` แทนที่จะเป็น Manual Row
- เก็บกวาดข้อมูลทดสอบสะสมทั้งหมดออกจาก Dev Database (Ticket/Dispute/FAQ ที่ไม่ใช่ Seed) ให้ Panel
  แสดงสถานะว่างสะอาดแบบเว็บจริง — หมายเหตุ: รัน `npm test` ซ้ำจะทำให้ข้อมูลทดสอบบางส่วนกลับมาอีก เพราะ
  Integration Test เขียนลง Database เดียวกับที่ App ใช้งานจริงตาม Pattern เดิมของ Repo (ไม่ใช่ Bug)
- ยืนยันด้วย Browser จริงครบทุก Section, `npm run lint` ผ่าน, `next build` ผ่านครบ 17 Route

## 2026-08-26 — Persistent Demo Data (Seed) for Tickets and Disputes

- ผู้ใช้ถามว่าทำไม Panel ไม่มีตั๋ว/ข้อพิพาทเลย — คำตอบคือลบข้อมูลทดสอบทิ้งไปเองตอนเก็บกวาดรอบก่อน
  ผู้ใช้เลือกให้เพิ่มข้อมูล Demo ถาวรใน `seed.js` แทนการปล่อยว่างไว้
- เพิ่ม Demo Buyer Account (`buyer.demo@example.com`, Fixed UUID) ใน `auth-service/prisma/seed.js` —
  ก่อนหน้านี้มีแต่ Demo SELLER/SUPPORT ไม่มี BUYER ที่ Fixed ID ให้ Service อื่นอ้างอิงได้เลย
- **สร้าง `order-service/prisma/seed.js` ใหม่ทั้งไฟล์ — ของเดิมไม่เคยมี Seed Script เลยตั้งแต่ Scaffold
  โปรเจกต์มา** เพิ่ม `"prisma":{"seed":...}` ใน `package.json`, ต่อเข้า `Dockerfile` CMD และ CI ให้ครบตาม
  Pattern เดียวกับ Service อื่น: Order Demo 3 รายการ (Disputed/Refunded/Completed) + DisputeCase Demo 2
  รายการ (OPEN 1, DECIDED 1) ผูกกับสินค้าจริงจาก `product-service` Seed (`p01`, `p05`, `p09`)
- เพิ่ม Ticket Demo 3 รายการใน `support-service/prisma/seed.js` ครอบคลุมสถานะหลากหลาย (NEW/IN_PROGRESS/
  ESCALATED) — 1 ใบผูกกับ `orderId` ของ Dispute Demo ที่เปิดใน `order-service` ให้ทั้งสอง Feature
  เชื่อมกันเหมือนเคสจริง
- ทั้งหมด Upsert-Only ด้วย Fixed ID (Pattern เดียวกับ Seed อื่นในโปรเจกต์) — Restart Container ซ้ำไม่สร้าง
  ข้อมูลซ้ำ
- ยืนยันด้วย Browser จริง: Panel แสดง Stat Card และตารางถูกต้องตามข้อมูล Seed หลัง Rebuild Container ใหม่
  ทั้ง `auth-service`, `order-service`, `support-service`
