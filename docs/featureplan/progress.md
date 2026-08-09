# RE-LOOP Combined Feature Progress

> อัปเดตล่าสุด: 2026-08-10

## สถานะรวม

**Planning revised - implementation not started**

แผนครอบคลุม `UR-01` ถึง `UR-39` แบบ 6 Vertical Role Features และเพิ่ม explicit
traceability `UR -> FR -> NFR -> Workflow -> Task/Phase` แล้ว รอบนี้ยังไม่มี Feature
implementation หรือ database migration ใหม่ถูกยกเป็น Done

| Feature          | Owner     | Planning | Core        | Extended    | Next action                               |
| ---------------- | --------- | -------- | ----------- | ----------- | ----------------------------------------- |
| Buyer            | วิศิษฏ์   | Revised  | Not started | Not started | Review `BUY-001` + Product DB contract    |
| Seller           | เอกตระการ | Revised  | Not started | Not started | Review `SEL-001` + Synthetic KYC schema   |
| Customer Service | อชิรวินท์ | Revised  | Not started | Not started | Review `CSS-001` + Chat PostgreSQL schema |
| Admin            | สิรดนัย   | Revised  | Not started | Not started | Start `ADM-001` functional role catalog   |
| Marketing        | ศิวกร     | Revised  | Not started | Not started | Review `MKT-001` Campaign schema          |
| Executive        | อัสนัย    | Revised  | Not started | Not started | Review `CEO-001` metric definitions       |

## Confirmed current evidence

- Requirement sources contain 39 UR, 49 FR, 27 NFR and 12 Workflows
- Repository has Auth, Product, Order and Review implementation/prototypeบางส่วน
- Buyer/Seller UI, pagination, upload, seller dashboard and seller reviews have prior evidence
  in `docs/progress.md`
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

Phase 0 has not passed: canonical Product/Order states, shared endpoint contracts,
functional role catalog, Chat Prisma setup and required PostgreSQL integration-test gates
still need implementation and six-role review

## Verification boundary

This round verified planning-document coverage and source structure only. No new Prisma schema
was applied and no new `REQUIRE_INTEGRATION=1` Feature test was run, so database/runtime status
remains **Not verified for the new plan**

## Next action

สิรดนัย starts `ADM-001`; service owners freeze Phase 0 contracts and each Feature Owner writes
the failing PostgreSQL-backed test from their first Core Task
