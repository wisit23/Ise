# RE-LOOP Combined Feature Progress

> อัปเดตล่าสุด: 2026-08-10

## สถานะรวม

**Planning revised - pulled source audited; plan acceptance not started**

แผนครอบคลุม `UR-01` ถึง `UR-39` แบบ 6 Vertical Role Features และเพิ่ม explicit
traceability `UR -> FR -> NFR -> Workflow -> Task/Phase` แล้ว Source ที่ pull มาเพิ่ม
Swipe/ProductVideo และ seller video upload แต่ยังไม่มี Feature ใหม่ถูกยกเป็น Done จนกว่า
contract, PostgreSQL acceptance และ reviewer evidence ของแผนนี้จะผ่าน

| Feature          | Owner     | Planning | Core         | Extended evidence              | Next action                               |
| ---------------- | --------- | -------- | ------------ | ------------------------------ | ----------------------------------------- |
| Buyer            | วิศิษฏ์   | Revised  | Not accepted | Swipe consumer baseline only   | Review `BUY-001` + Product DB contract    |
| Seller           | เอกตระการ | Revised  | Not accepted | ProductVideo provider baseline | Review `SEL-001` + Synthetic KYC schema   |
| Customer Service | อชิรวินท์ | Revised  | Not accepted | None                           | Review `CSS-001` + Chat PostgreSQL schema |
| Admin            | สิรดนัย   | Revised  | Not accepted | None                           | Start `ADM-001` functional role catalog   |
| Marketing        | ศิวกร     | Revised  | Not accepted | Swipe baseline; not `UR-11`    | Review `MKT-001` + freeze Swipe semantics |
| Executive        | อัสนัย    | Revised  | Not accepted | None                           | Review `CEO-001` metric definitions       |

## Confirmed current evidence

- Requirement sources contain 39 UR, 49 FR, 27 NFR and 12 Workflows
- Repository has Auth, Product, Order and Review implementation/prototypeบางส่วน
- Buyer/Seller UI, pagination, upload, seller dashboard and seller reviews have prior evidence
  in the restored upstream `docs/progress.md`
- Pulled source adds Prisma `ProductVideo`, seller-owned upload, public paginated video feed,
  `/seller/videos/new`, `/swipe` and Product ownership/role tests
- `/swipe` currently scrolls feed and links to Product only; no persisted choose/swipe action exists
- ProductVideo feed currently includes every Product state except `removed`, and `sellerName` comes
  from request body; both remain Gate 0 contract decisions
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

Phase 0 has not passed: canonical Product/Order states, Swipe/ProductVideo semantics and identity,
shared endpoint contracts, functional role catalog, Chat Prisma setup and required PostgreSQL
integration-test gates still need implementation and six-role review

## Verification boundary

This refresh statically inspected the pulled source and retained upstream historical evidence.

- `npm run lint`: passed
- First `npm test`: failed during setup because generated Prisma clients were absent
- After `prisma generate` for Auth/Product/Order/Review, `npm test`: 30 passed, 3 database tests skipped, 0 failed
- `npm run test:frontend`: 2 passed, 0 failed
- `npm run secret-scan`: passed, 0 potential secrets across 177 tracked files
- `npm --workspace frontend run build`: passed and generated `/swipe` plus `/seller/videos/new`;
  warning remains that Next.js ESLint plugin is not configured
- `docker compose config --quiet`: passed
- `docker compose ps`: Docker was reachable after approval but no project containers were running
- Host Node was `24.18.1`, outside repository engine `>=22.11.0 <23.0.0`

No `REQUIRE_INTEGRATION=1`, Docker E2E or browser scenario was rerun. The upstream-reported
database/browser results therefore remain historical evidence and current database/runtime status is
**Not reverified for the new plan**

## Next action

สิรดนัย starts `ADM-001`; service owners freeze Phase 0 contracts and each Feature Owner writes
the failing PostgreSQL-backed test from their first Core Task
