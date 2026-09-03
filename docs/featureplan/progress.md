# RE-LOOP Combined Feature Progress

> อัปเดตล่าสุด: 2026-08-10

## สถานะรวม

**Planning revised - BUY-002 and ProductVideo/Swipe refactor verified locally; plan acceptance incomplete**

แผนครอบคลุม `UR-01` ถึง `UR-39` แบบ 6 Vertical Role Features และเพิ่ม explicit
traceability `UR -> FR -> NFR -> Workflow -> Task/Phase` แล้ว Source ที่ pull มาเพิ่ม
Swipe/ProductVideo และ seller video upload จากนั้น refactor เป็นโมดูลที่แยก responsibility,
แก้ feed/identity correctness และเพิ่ม tests แล้ว Buyer `BUY-002` ผ่าน PostgreSQL acceptance ในเครื่อง
แต่ยังไม่มี Feature รวมถูกยกเป็น Done จนกว่า task อื่น, Swipe-to-Choose semantics และ reviewer evidence จะผ่าน

| Feature          | Owner     | Planning | Core                       | Extended evidence              | Next action                               |
| ---------------- | --------- | -------- | -------------------------- | ------------------------------ | ----------------------------------------- |
| Buyer            | วิศิษฏ์   | Revised  | `BUY-002` verified locally | Swipe baseline not accepted    | Review `BUY-002`; then resume `BUY-001`   |
| Seller           | เอกตระการ | Revised  | Not accepted               | Refactored ProductVideo module | Review `SEL-001` + Synthetic KYC schema   |
| Customer Service | อชิรวินท์ | Revised  | Not accepted               | None                           | Review `CSS-001` + Chat PostgreSQL schema |
| Admin            | สิรดนัย   | Revised  | Not accepted               | None                           | Start `ADM-001` functional role catalog   |
| Marketing        | ศิวกร     | Revised  | Not accepted               | Improved baseline; not `UR-11` | Review `MKT-001` + freeze Swipe semantics |
| Executive        | อัสนัย    | Revised  | Not accepted               | None                           | Review `CEO-001` metric definitions       |

## Confirmed current evidence

- Requirement sources contain 39 UR, 49 FR, 27 NFR and 12 Workflows
- Repository has Auth, Product, Order and Review implementation/prototypeบางส่วน
- Buyer/Seller UI, pagination, upload, seller dashboard and seller reviews have prior evidence
  in the restored upstream `docs/progress.md`
- Pulled source adds Prisma `ProductVideo`, seller-owned upload, public paginated video feed,
  `/seller/videos/new`, `/swipe` and Product ownership/role tests
- ProductVideo now follows `route -> controller -> service -> repository -> Prisma`; the general
  Product controller/model no longer contain video-feed rules
- Feed now queries Product `available` only and has a `createdAt` index planned in Prisma schema
- Seller display name now comes from signed JWT claims built from Auth database fields; Product
  service ignores client-supplied `sellerName`
- `/swipe` has separate viewer/card components, five frontend tests total and plays only the active
  clip; no persisted choose/swipe action exists
- `BUY-002` persists Product/Order reservation identity and expiry, uses atomic Product compare-and-set,
  compensates failed Order writes, reuses retries and shows a live 10-minute Cart countdown
- Test preparation now generates only missing/stale Prisma clients automatically
- Pulled Auth seed adds four deterministic demo Seller accounts; this is development seed evidence,
  not Synthetic KYC or Admin/RBAC acceptance
- Chat service still has no persisted chat feature in current source
- Admin, Marketing and Executive do not yet have complete Feature modules/UI
- Docker Compose defines separate PostgreSQL databases per service through service-specific URLs

Prototype/history is input for review only and does not change the new Feature status to Done

## Approved planning boundaries

- Mock: deterministic Payment provider behavior and Synthetic KYC content only
- Real persistence: Prisma/PostgreSQL for KYC, Product, Reservation, Order, PaymentAttempt,
  Chat, Review, Support, Campaign and reporting data
- Mock/in-memory database is not accepted as Feature evidence
- Security hardening (`NFR-SP-*`, `NFR-CP-*`, encryption/PDPA/PCI-DSS/secrets/abuse controls)
  is deferred to a later Security Phase

## Current blocker

Phase 0 has not passed: `BUY-002` established its local reservation contract, but remaining Product/Order
states, Swipe-to-Choose semantics, functional role catalog, Chat Prisma setup and other PostgreSQL
integration-test gates still need implementation and six-role review

## Verification boundary

This refresh implemented and locally tested `BUY-002` while retaining upstream historical evidence.

- `npm run lint`: passed
- `REQUIRE_INTEGRATION=1 npm test`: 47 passed, 0 skipped, 0 failed against isolated PostgreSQL 16
- `npm run test:frontend`: 7 passed, 0 failed
- `npm run secret-scan`: passed, 0 potential secrets across 190 tracked files
- `npm --workspace frontend run build`: passed and generated `/cart`, `/orders`, `/swipe` and other routes;
  warning remains that Next.js ESLint plugin is not configured
- Product and Order Prisma schemas validated; Product/Order test schemas were applied at port `55432`
- Repository Compose stack was not started because host port `5432` belonged to unrelated `csdev022`
- Host Node was `24.18.1`, outside repository engine `>=22.11.0 <23.0.0`

No repository-wide Docker/browser E2E or deployment was run. ProductVideo index and `BUY-002` schema
were applied only to the disposable PostgreSQL test container, not a shared or production database

## Next action

Reviewer checks `BUY-002` evidence before acceptance. Buyer work does not advance to another task in
this change; after review, the existing plan resumes at `BUY-001`
