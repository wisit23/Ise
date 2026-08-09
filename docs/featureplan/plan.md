# RE-LOOP Combined Role Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้สมาชิก 6 คนส่งมอบ Vertical Feature ตาม Role ที่ได้รับ โดยครอบคลุม
`UR-01` ถึง `UR-39` และรวมเป็นระบบเดียวผ่าน API contract, PostgreSQL-backed tests
และ integration gates

**Architecture:** แต่ละ Feature มี Owner คนเดียวและทำครบ Frontend, Backend, Prisma/PostgreSQL,
tests และเอกสาร Feature ใช้ Gateway และ service ownership เดิม ห้ามอ่าน database ของ service
อื่นโดยตรง Requirement ที่ข้าม Feature ใช้ provider/consumer contract ใน `integration.md`

**Tech Stack:** Next.js 15 App Router, React 18, JavaScript, Express, Prisma,
PostgreSQL 16, Redis 7, Node.js test runner, Jest และ Docker Compose

## Global Constraints

- Node.js `>=22.11.0 <23.0.0`; npm `>=10.0.0`
- วางแผนครบ `UR-01` ถึง `UR-39`; Core ทำก่อน Extended แต่ Requirement ต้องมี trace row ครบ
- Mock ได้เฉพาะ deterministic Payment provider behavior และเนื้อหา Synthetic KYC
- KYC application/decision, payment attempt/state และ Feature data อื่นต้อง persist ใน PostgreSQL จริง
- ห้ามใช้ in-memory repository, array หรือ mock database เป็น Feature acceptance evidence
- Pure-function unit test ใช้ fixture ได้ แต่ทุก persistence Task ต้องมี PostgreSQL integration test
- Service ห้ามอ่าน database ของ service อื่นโดยตรง
- Functional role/ownership checks ที่ทำให้ Feature ถูกต้องอยู่ใน Core
- Security hardening (`NFR-SP-*`, `NFR-CP-*`, encryption/PDPA/PCI-DSS/secrets/abuse controls)
  เป็น Deferred Security Phase และไม่ใช่ Done gate ของรอบนี้
- Owner ห้าม review Feature ของตนเอง
- `progress.md` เก็บสถานะปัจจุบัน; `changelog.md` เป็น append-only history;
  `teachme.md` เพิ่มเมื่อมี implementation evidence เท่านั้น
- Prototype เดิมต้องผ่าน acceptance criteria และ database-backed tests ของแผนใหม่นี้ก่อนยกเป็น Done

---

## Feature Ownership and Coverage

| Feature          | Owner     | Explicit UR rows | Core Tasks          | Extended Tasks      | Primary data owner                        |
| ---------------- | --------- | ---------------- | ------------------- | ------------------- | ----------------------------------------- |
| Buyer            | วิศิษฏ์   | `UR-01`–`UR-07`  | `BUY-001`–`BUY-004` | `BUY-005`           | Product, Order, Review consumers          |
| Marketing        | ศิวกร     | `UR-08`–`UR-16`  | `MKT-001`–`MKT-003` | `MKT-004`–`MKT-005` | Product Campaign + Order attribution      |
| Customer Service | อชิรวินท์ | `UR-17`–`UR-21`  | `CSS-001`–`CSS-003` | `CSS-004`           | Chat + Order support/dispute              |
| Admin            | สิรดนัย   | `UR-22`–`UR-26`  | `ADM-001`–`ADM-004` | `ADM-005`           | Auth, Product and Order owner commands    |
| Executive        | อัสนัย    | `UR-27`–`UR-31`  | `CEO-001`–`CEO-003` | `CEO-004`–`CEO-005` | Read-only owner-local aggregates          |
| Seller           | เอกตระการ | `UR-32`–`UR-39`  | `SEL-001`–`SEL-004` | `SEL-005`           | Auth KYC, Product listing, Order shipping |

ตาราง `UR -> FR -> NFR -> Workflow -> Task/Phase` แบบ explicit อยู่ใน `plan.md`
ของแต่ละ Feature ห้ามใช้ช่วง Requirement แทนแต่ละแถวใน traceability table

## Requirement-Document Gaps to Preserve

- `UR-11` มี `WF-03` แต่ไม่มี FR เฉพาะสำหรับ Swipe-to-Choose จึง trace ไป `MKT-005`
  และ Buyer `BUY-005` พร้อมบันทึกช่องว่างนี้ ไม่สร้าง FR ใหม่เอง
- `UR-39` มี `FR-1.3.5`, `FR-4.2.6` และ `FR-5.2.5` แต่ไม่มี Workflow ประมูลเฉพาะ
  จึงใช้ provider chain Seller -> Admin -> Marketing โดยไม่สร้างหมายเลข Workflow ใหม่
- State name ใน Requirement และ source ปัจจุบันต่างกัน Phase 0 ต้อง freeze canonical mapping
  ใน `integration.md` ก่อนแก้ schema หรือ UI

## Phase 0 - Shared Foundation

- [ ] `FOUND-001` ยืนยัน database ownership: `reloop_auth`, `reloop_product`,
      `reloop_order`, `reloop_chat`, `reloop_review` และ disposable test data policy
- [ ] `FOUND-002` Freeze Product/Order/Campaign/KYC/Case states และ Requirement-to-code mapping
- [ ] `FOUND-003` Freeze response/error shapes และ provider/consumer endpoint signatures
- [ ] `ADM-001` เพิ่ม functional multi-role/permission catalog ที่ 6 Feature ใช้งานร่วมกัน
- [ ] `FOUND-004` เพิ่ม PostgreSQL integration-test gate ที่ fail เมื่อ
      `REQUIRE_INTEGRATION=1` แต่ database/schema ใช้งานไม่ได้
- [ ] Reviewer ทั้ง 6 คนยืนยันว่า schema/API ownership ไม่ซ้อนกันก่อนเริ่ม Phase 1

### PostgreSQL readiness commands

Run from repository root:

```powershell
docker compose up -d postgres
docker compose ps postgres
docker compose up -d --build auth-service product-service order-service chat-service review-service
```

หลัง Task เพิ่มหรือแก้ Prisma schema ให้ apply schema ภายใน container ของ service owner:

```powershell
docker compose exec auth-service npx prisma db push --schema prisma/schema.prisma
docker compose exec product-service npx prisma db push --schema prisma/schema.prisma
docker compose exec order-service npx prisma db push --schema prisma/schema.prisma
docker compose exec chat-service npx prisma db push --schema prisma/schema.prisma
docker compose exec review-service npx prisma db push --schema prisma/schema.prisma
```

ตัวอย่าง database-backed test command ที่ Task plans ระบุไว้:

```powershell
docker compose exec -e REQUIRE_INTEGRATION=1 auth-service node --test test/kyc.integration.test.js
docker compose exec -e REQUIRE_INTEGRATION=1 product-service node --test test/product-crud.integration.test.js
docker compose exec -e REQUIRE_INTEGRATION=1 order-service node --test test/mock-payment.integration.test.js
docker compose exec -e REQUIRE_INTEGRATION=1 chat-service node --test test/chat-auth.integration.test.js
docker compose exec -e REQUIRE_INTEGRATION=1 review-service node --test test/review-crud.integration.test.js
```

Expected: `db push` และ integration test exit `0`; test ต้อง query `SELECT 1`, สร้าง fixture,
อ่านผลกลับจาก PostgreSQL และ cleanup เฉพาะ fixture ของ test ห้ามผ่านด้วยการ skip

## Phase 1 - Core Vertical Features

เริ่มหลัง provider contract ของ Task นั้นผ่าน review งานแต่ละ Feature merge แยกกันได้:

- [ ] Buyer: `BUY-001` Catalog -> `BUY-002` Reservation -> `BUY-003` Mock Checkout/Tracking
      -> `BUY-004` Trust/Contact
- [ ] Seller: `SEL-001` Synthetic KYC -> `SEL-002` Listing -> `SEL-003` Inventory/Shipping
      -> `SEL-004` Insights
- [ ] Customer Service: `CSS-001` Chat -> `CSS-002` Order/Case -> `CSS-003` Simulated Refund
- [ ] Admin: `ADM-002` KYC Decision -> `ADM-003` Moderation -> `ADM-004` Mock Fund Hold
- [ ] Marketing: `MKT-001` Campaign -> `MKT-002` Approval/Publish -> `MKT-003` Attribution
- [ ] Executive: `CEO-001` Metrics -> `CEO-002` Dashboard -> `CEO-003` Rankings

ทุก Task ต้องจบด้วย targeted test, PostgreSQL integration test เมื่อมี persistence,
relevant workspace test, docs update และ commit ที่ไม่ปน Feature อื่น

## Phase 2 - Core Integration

- [ ] Apply schema ตาม owner order: Auth -> Product -> Order -> Chat -> Review
- [ ] ทดสอบ `Synthetic KYC -> Admin approve -> Listing with 4 images -> Public search`
- [ ] ทดสอบ `Reserve 10 minutes -> Mock Payment -> Ship -> Receive -> Review`
- [ ] ทดสอบ `Chat -> Support case -> Dispute -> Simulated refund/hold decision`
- [ ] ทดสอบ Campaign attribution และ Executive aggregate จาก completed Order fixture เดียวกัน
- [ ] ทดสอบ restart/expiry/idempotency โดยอ่าน state กลับจาก PostgreSQL
- [ ] ปิด Gate 1 เมื่อ reviewer ครบและ root/role `progress.md` ตรงกัน

## Phase 3 - Extended Vertical Features

- [ ] Buyer `BUY-005`: style profile, wishlist, rule-based recommendation และ swipe consumer
- [ ] Seller `SEL-005`: quick replies, rule-based price recommendation และ auction submission
- [ ] Customer Service `CSS-004`: FAQ revisions และ SLA priority
- [ ] Admin `ADM-005`: auction approval และ bounded operations
- [ ] Marketing `MKT-004`–`MKT-005`: segmentation, content, auction และ swipe
- [ ] Executive `CEO-004`–`CEO-005`: anomaly alert และ CSV/PDF export
- [ ] รัน Extended integration scenarios ด้วย PostgreSQL fixture และปิด Gate 2

## Deferred Security Phase

Security Phase เริ่มหลัง Core/Extended feature behavior ผ่านแล้ว โดยแยก plan ใหม่สำหรับ
`NFR-SP-01`–`NFR-SP-03`, `NFR-CP-01`–`NFR-CP-02`, encryption, PDPA operations,
PCI-DSS boundary, production secrets, privileged audit hardening และ abuse/load controls
ห้ามเขียนว่า security requirement Done ใน `progress.md` ของรอบนี้

## Definition of Done per Feature Task

- Trace row ระบุ UR, FR, NFR, Workflow และ Task/Phase ชัดเจน
- Files และ interface ตรงกับ service owner
- Failing test ถูกเขียนและรันก่อน implementation
- Persistence ใช้ Prisma/PostgreSQL จริงและ integration test ไม่ skip
- Mock Payment/Synthetic KYC ถูกระบุชัดและไม่มีข้อมูลเงินจริง
- Targeted tests, relevant workspace tests และ `npm run lint` ผ่าน
- `progress.md`, `changelog.md` และเมื่อมีบทเรียนจริง `teachme.md` ถูกอัปเดต
- Reviewer ที่ไม่ใช่ Owner ตรวจ acceptance evidence แล้ว

## Repository Verification before Merge

```powershell
npm run lint
npm run format:check
npm run secret-scan
npm test
npm run test:frontend
npm --workspace frontend run build
docker compose config --quiet
```

Expected: ทุกคำสั่ง exit `0`; database integration tests ที่เกี่ยวข้องรันด้วย
`REQUIRE_INTEGRATION=1` และห้าม skip
